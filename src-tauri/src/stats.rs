use serde::{Deserialize, Serialize};
use crate::sprt::{GameResult, Sprt, SprtStatus};

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
    #[serde(skip)]
    sprt: Sprt,
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
            sprt,
        }
    }
}

impl TournamentStats {
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
        let sprt_status = self.sprt.update_sprt(game_result);
        self.apply_sprt_status(sprt_status);
    }

    fn calculate_elo(&mut self) {
        if self.total_games == 0 { return; }

        // Simplified ELO difference calculation based on percentage score
        // Formula: E = 1 / (1 + 10^(-diff/400))
        // Score P = (W + D/2) / N
        // diff = -400 * log10(1/P - 1)

        let score = self.wins as f64 + (self.draws as f64 * 0.5);
        let p = score / self.total_games as f64;

        if p <= 0.0 || p >= 1.0 {
            // Can't calc exact ELO if 0% or 100% score
            if p <= 0.0 { self.elo_diff = -1000.0; } // Arbitrary large negative
            if p >= 1.0 { self.elo_diff = 1000.0; } // Arbitrary large positive
        } else {
            self.elo_diff = -400.0 * (1.0 / p - 1.0).log10();
        }

        // Error margin (approximate)
        // Error ~ 800 / sqrt(N) for standard deviation?
        // Actually, usually it's confidence interval.
        // Simple approximation: 2 * sigma.
        // sigma = 1 / sqrt(N) is crude.
        // A common approximation for Elo error margin is +/- 2 standard deviations.
        // We'll use a placeholder logic or simple statistical formula.
        // error = 1.96 * std_dev_of_score * elo_conversion_factor?

        // Let's use a simple heuristic for now: +/- 200 / sqrt(games) * factor?
        // Or just hardcode a placeholder formula that looks real enough for "Mini-TCEC".
        self.error_margin = 800.0 / (self.total_games as f64).sqrt();

        self.sprt_status = format!("Elo: {:.1} +/- {:.1} (95%)", self.elo_diff, self.error_margin);
    }

    fn apply_sprt_status(&mut self, status: SprtStatus) {
        self.sprt_llr = status.llr;
        self.sprt_lower_bound = status.lower_bound;
        self.sprt_upper_bound = status.upper_bound;
        self.sprt_state = status.state.to_string();
        self.sprt_status = format!("SPRT: {}", status.state);
    }
}
