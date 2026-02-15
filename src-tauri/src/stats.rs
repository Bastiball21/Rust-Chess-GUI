use serde::{Deserialize, Serialize};
use crate::sprt::{GameResult, Sprt, SprtConfig, SprtStatus};
use crate::types::{Standings, StandingsEntry};
use std::collections::HashMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TournamentStats {
    pub wins: u32,
    pub losses: u32,
    pub draws: u32,
    pub total_games: u32,
    pub elo_diff: f64,
    pub error_margin: f64,
    pub sprt_status: String,
    pub sprt_llr: f64,
    pub sprt_lower_bound: f64,
    pub sprt_upper_bound: f64,
    pub sprt_state: String,
    pub sprt_enabled: bool,
    pub standings: Standings, // Integrated Standings
    #[serde(skip)]
    sprt: Sprt,
    #[serde(skip)]
    match_matrix: HashMap<(String, String), (f64, f64)>, // (P1, P2) -> (Score1, Score2) for SB calc
}

impl Default for TournamentStats {
    fn default() -> Self {
        let sprt = Sprt::default();
        let status = sprt.status();
        Self {
            wins: 0,
            losses: 0,
            draws: 0,
            total_games: 0,
            elo_diff: 0.0,
            error_margin: 0.0,
            sprt_status: format!("SPRT: {}", status.state),
            sprt_llr: status.llr,
            sprt_lower_bound: status.lower_bound,
            sprt_upper_bound: status.upper_bound,
            sprt_state: status.state.to_string(),
            sprt_enabled: true,
            sprt,
            standings: Standings::default(),
            match_matrix: HashMap::new(),
        }
    }
}

impl TournamentStats {
    pub fn new(sprt_enabled: bool, sprt_config: Option<SprtConfig>) -> Self {
        let sprt = Sprt::new(sprt_config.unwrap_or_default());
        let status = sprt.status();
        let mut stats = Self {
            wins: 0,
            losses: 0,
            draws: 0,
            total_games: 0,
            elo_diff: 0.0,
            error_margin: 0.0,
            sprt_status: format!("SPRT: {}", status.state),
            sprt_llr: status.llr,
            sprt_lower_bound: status.lower_bound,
            sprt_upper_bound: status.upper_bound,
            sprt_state: status.state.to_string(),
            sprt_enabled,
            sprt,
            standings: Standings::default(),
            match_matrix: HashMap::new(),
        };

        if !sprt_enabled {
            stats.sprt_state = "Disabled".to_string();
            stats.sprt_status = "SPRT: Disabled".to_string();
            stats.sprt_llr = 0.0;
            stats.sprt_lower_bound = 0.0;
            stats.sprt_upper_bound = 0.0;
        }

        stats
    }

    pub fn update(&mut self, result: &str, is_white_engine_a: bool) {
        // Result string is "1-0", "0-1", "1/2-1/2"
        let game_result = match result {
            "1-0" => Some(if is_white_engine_a { GameResult::Win } else { GameResult::Loss }),
            "0-1" => Some(if is_white_engine_a { GameResult::Loss } else { GameResult::Win }),
            "1/2-1/2" => Some(GameResult::Draw),
            _ => None,
        };

        let Some(game_result) = game_result else {
            return;
        };

        match game_result {
            GameResult::Win => self.wins += 1,
            GameResult::Draw => self.draws += 1,
            GameResult::Loss => self.losses += 1,
        }
        self.total_games += 1;
        self.calculate_elo();
        if self.sprt_enabled {
            let sprt_status = self.sprt.update_sprt(game_result);
            self.apply_sprt_status(sprt_status);
        } else {
            self.sprt_state = "Disabled".to_string();
            self.sprt_llr = 0.0;
            self.sprt_lower_bound = 0.0;
            self.sprt_upper_bound = 0.0;
        }

        // Note: Full Standings update requires engine names and IDs,
        // which are not passed here.
        // Logic for full standings is better handled by re-processing the schedule
        // or passing more data to `update`.
        // For now, `arbiter.rs` calls this.
        // Ideally, `arbiter.rs` should manage `Standings` calculation or pass full info.
        // Due to scope, I will stub `standings` here or rely on Arbiter to populate it if needed,
        // but `TournamentStats` is usually just for the H2H of the main pair in a match.
        // Wait, for Round Robin, `TournamentStats` needs to be richer.
        // The current struct seems designed for 1v1 Match mode.
        // I will upgrade it to be generic for all modes by using `standings`.
    }

    pub fn update_standings(&mut self, entries: Vec<StandingsEntry>) {
        self.standings.entries = entries;
    }

    fn calculate_elo(&mut self) {
        if self.total_games == 0 { return; }
        let score = self.wins as f64 + (self.draws as f64 * 0.5);
        let p = score / self.total_games as f64;

        if p <= 0.0 || p >= 1.0 {
            if p <= 0.0 { self.elo_diff = -1000.0; }
            if p >= 1.0 { self.elo_diff = 1000.0; }
            self.error_margin = 0.0;
        } else {
            self.elo_diff = -400.0 * (1.0 / p - 1.0).log10();

            // Calculate Variance of Score
            // E[X^2] = (1^2 * W + 0.5^2 * D + 0^2 * L) / N
            let ex2 = (self.wins as f64 + 0.25 * self.draws as f64) / self.total_games as f64;
            // Var(X) = E[X^2] - (E[X])^2
            let var_x = ex2 - p * p;

            // Standard Error of Mean Score
            let se_p = (var_x / self.total_games as f64).sqrt();

            // Derivative of Elo function with respect to p
            // d(Elo)/dp = 400 / (ln(10) * p * (1-p))
            let slope = 400.0 / (std::f64::consts::LN_10 * p * (1.0 - p));

            // 95% Confidence Interval Margin
            self.error_margin = 1.96 * se_p * slope;
        }

        if !self.sprt_enabled {
            self.sprt_status = format!("Elo: {:.1} +/- {:.1} (95%)", self.elo_diff, self.error_margin);
        }
    }

    fn apply_sprt_status(&mut self, status: SprtStatus) {
        self.sprt_llr = status.llr;
        self.sprt_lower_bound = status.lower_bound;
        self.sprt_upper_bound = status.upper_bound;
        self.sprt_state = status.state.to_string();
        self.sprt_status = format!("SPRT: {}", status.state);
    }
}

pub fn calculate_standings(schedule: &[crate::types::ScheduledGame], engines: &[crate::types::EngineConfig]) -> Vec<StandingsEntry> {
    let mut entries_map: HashMap<String, StandingsEntry> = HashMap::new();
    let mut sb_map: HashMap<String, HashMap<String, f64>> = HashMap::new(); // Player -> Opponent -> Points Won Against

    // Initialize entries
    for engine in engines {
        entries_map.insert(engine.name.clone(), StandingsEntry {
            rank: 0,
            engine_name: engine.name.clone(),
            engine_id: engine.id.clone(),
            games_played: 0,
            points: 0.0,
            score_percent: 0.0,
            wins: 0,
            losses: 0,
            draws: 0,
            crashes: 0, // Need to pipe this in if possible, or accept 0 for now
            sb: 0.0,
            elo: 0.0, // Need global ELO calc logic or placeholder
            elo_diff: None,
        });
    }

    // Process games for Points and Basic Stats
    for game in schedule {
        if let Some(result) = &game.result {
            let white = &game.white_name;
            let black = &game.black_name;

            // Check if engines exist in map (might be disabled/removed ones, but typically they are in config)
            if !entries_map.contains_key(white) { continue; } // Should not happen if config syncs
            if !entries_map.contains_key(black) { continue; }

            let (w_pts, b_pts) = match result.as_str() {
                "1-0" | "1-0 (forfeit)" => (1.0, 0.0),
                "0-1" | "0-1 (forfeit)" => (0.0, 1.0),
                "1/2-1/2" | "1/2-1/2 (forfeit)" => (0.5, 0.5),
                _ => (0.0, 0.0), // Unknown result
            };

            if let Some(entry) = entries_map.get_mut(white) {
                entry.games_played += 1;
                entry.points += w_pts;
                if w_pts == 1.0 { entry.wins += 1; }
                else if w_pts == 0.5 { entry.draws += 1; }
                else { entry.losses += 1; }
            }
            if let Some(entry) = entries_map.get_mut(black) {
                entry.games_played += 1;
                entry.points += b_pts;
                if b_pts == 1.0 { entry.wins += 1; }
                else if b_pts == 0.5 { entry.draws += 1; }
                else { entry.losses += 1; }
            }

            // Track H2H points for SB
            *sb_map.entry(white.clone()).or_default().entry(black.clone()).or_insert(0.0) += w_pts;
            *sb_map.entry(black.clone()).or_default().entry(white.clone()).or_insert(0.0) += b_pts;
        }
    }

    // Calculate SB
    // SB = Sum of (Opponent's Final Score) * (Points Won Against Opponent)
    // Note: This requires Opponent's Final Score, which we have in `entries_map` after first pass.
    let scores: HashMap<String, f64> = entries_map.iter().map(|(k, v)| (k.clone(), v.points)).collect();

    for (player, opponents) in &sb_map {
        let mut sb = 0.0;
        for (opponent, points_against) in opponents {
             if let Some(opp_score) = scores.get(opponent) {
                 sb += points_against * opp_score;
             }
        }
        if let Some(entry) = entries_map.get_mut(player) {
            entry.sb = sb;
        }
    }

    // Finalize stats (percent, rank, elo)
    let mut entries: Vec<StandingsEntry> = entries_map.into_values().collect();

    // Sort by Points desc, then SB desc, then Wins desc
    entries.sort_by(|a, b| {
        b.points.partial_cmp(&a.points).unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.sb.partial_cmp(&a.sb).unwrap_or(std::cmp::Ordering::Equal))
            .then_with(|| b.wins.cmp(&a.wins))
    });

    for (i, entry) in entries.iter_mut().enumerate() {
        entry.rank = (i + 1) as u32;
        if entry.games_played > 0 {
            entry.score_percent = (entry.points / entry.games_played as f64) * 100.0;

            // Basic Elo Estimation
            // P = 1 / (1 + 10^(-D/400))
            // D = -400 * log10(1/P - 1)
            let p = entry.points / entry.games_played as f64;
             if p <= 0.001 { entry.elo = -1000.0; } // Cap
             else if p >= 0.999 { entry.elo = 1000.0; } // Cap
             else {
                 entry.elo = -400.0 * (1.0 / p - 1.0).log10();
             }
        }
    }

    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_elo_calculation_balanced_draws() {
        let mut stats = TournamentStats::default();
        stats.total_games = 100;
        stats.wins = 0;
        stats.losses = 0;
        stats.draws = 100;

        stats.calculate_elo();

        assert_eq!(stats.elo_diff, 0.0);
        assert_eq!(stats.error_margin, 0.0);
    }

    #[test]
    fn test_elo_calculation_decisive_split() {
        let mut stats = TournamentStats::default();
        stats.total_games = 100;
        stats.wins = 50;
        stats.losses = 50;
        stats.draws = 0;
        // p = 0.5.
        // ex2 = (50 + 0) / 100 = 0.5
        // var_x = 0.5 - 0.25 = 0.25
        // se_p = sqrt(0.25/100) = 0.5/10 = 0.05
        // slope = 400 / (ln(10) * 0.25) = 400 / (2.302585 * 0.25) = 400 / 0.5756 = 694.87
        // margin = 1.96 * 0.05 * 694.87 = 68.09

        stats.calculate_elo();
        assert_eq!(stats.elo_diff, 0.0);
        assert!((stats.error_margin - 68.1).abs() < 1.0);
    }

    #[test]
    fn test_elo_calculation_advantage() {
        let mut stats = TournamentStats::default();
        stats.total_games = 100;
        stats.wins = 60;
        stats.losses = 20;
        stats.draws = 20;
        // score = 60 + 10 = 70. p = 0.7.
        // elo = -400 * log10(1/0.7 - 1) = -400 * log10(0.428) = -400 * -0.368 = 147.3

        // ex2 = (60 + 0.25*20) / 100 = 65 / 100 = 0.65
        // var_x = 0.65 - 0.49 = 0.16
        // se_p = sqrt(0.16/100) = 0.4 / 10 = 0.04
        // slope = 400 / (ln(10) * 0.7 * 0.3) = 400 / (2.3026 * 0.21) = 400 / 0.4835 = 827.2
        // margin = 1.96 * 0.04 * 827.2 = 64.85

        stats.calculate_elo();
        assert!((stats.elo_diff - 147.3).abs() < 1.0);
        assert!((stats.error_margin - 64.85).abs() < 1.0);
    }

    #[test]
    fn test_elo_edge_cases() {
         let mut stats = TournamentStats::default();
         stats.total_games = 10;
         stats.wins = 10;
         stats.calculate_elo();
         assert_eq!(stats.elo_diff, 1000.0);
         assert_eq!(stats.error_margin, 0.0);

         stats.wins = 0;
         stats.losses = 10;
         stats.calculate_elo();
         assert_eq!(stats.elo_diff, -1000.0);
         assert_eq!(stats.error_margin, 0.0);
    }
}
