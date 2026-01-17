use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub enum GameResult {
    Win,
    Draw,
    Loss,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub enum SprtState {
    Continue,
    Accept,
    Reject,
}

impl std::fmt::Display for SprtState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SprtState::Continue => write!(f, "Continue"),
            SprtState::Accept => write!(f, "Accept"),
            SprtState::Reject => write!(f, "Reject"),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SprtStatus {
    pub llr: f64,
    pub lower_bound: f64,
    pub upper_bound: f64,
    pub state: SprtState,
    pub wins: u32,
    pub draws: u32,
    pub losses: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SprtConfig {
    pub h0_elo: f64,
    pub h1_elo: f64,
    pub draw_ratio: f64,
    pub alpha: f64,
    pub beta: f64,
}

impl Default for SprtConfig {
    fn default() -> Self {
        Self {
            h0_elo: 0.0,
            h1_elo: 5.0,
            draw_ratio: 0.5,
            alpha: 0.05,
            beta: 0.05,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Sprt {
    config: SprtConfig,
    wins: u32,
    draws: u32,
    losses: u32,
}

impl Default for Sprt {
    fn default() -> Self {
        Self::new(SprtConfig::default())
    }
}

impl Sprt {
    pub fn new(config: SprtConfig) -> Self {
        Self {
            config,
            wins: 0,
            draws: 0,
            losses: 0,
        }
    }

    pub fn update_sprt(&mut self, result: GameResult) -> SprtStatus {
        match result {
            GameResult::Win => self.wins += 1,
            GameResult::Draw => self.draws += 1,
            GameResult::Loss => self.losses += 1,
        }
        self.status()
    }

    pub fn status(&self) -> SprtStatus {
        let llr = self.calculate_llr();
        let (lower_bound, upper_bound) = self.bounds();
        let state = if llr >= upper_bound {
            SprtState::Accept
        } else if llr <= lower_bound {
            SprtState::Reject
        } else {
            SprtState::Continue
        };
        SprtStatus {
            llr,
            lower_bound,
            upper_bound,
            state,
            wins: self.wins,
            draws: self.draws,
            losses: self.losses,
        }
    }

    fn bounds(&self) -> (f64, f64) {
        let alpha = self.config.alpha.clamp(1e-6, 0.5);
        let beta = self.config.beta.clamp(1e-6, 0.5);
        let lower = (beta / (1.0 - alpha)).ln();
        let upper = ((1.0 - beta) / alpha).ln();
        (lower, upper)
    }

    fn calculate_llr(&self) -> f64 {
        let (p0_win, p0_draw, p0_loss) = expected_probabilities(self.config.h0_elo, self.config.draw_ratio);
        let (p1_win, p1_draw, p1_loss) = expected_probabilities(self.config.h1_elo, self.config.draw_ratio);
        let mut llr = 0.0;
        llr += self.wins as f64 * (p1_win / p0_win).ln();
        llr += self.draws as f64 * (p1_draw / p0_draw).ln();
        llr += self.losses as f64 * (p1_loss / p0_loss).ln();
        llr
    }
}

fn expected_probabilities(elo: f64, draw_ratio: f64) -> (f64, f64, f64) {
    let draw = draw_ratio.clamp(0.0, 0.99);
    let win_rate = 1.0 / (1.0 + 10f64.powf(-elo / 400.0));
    let win = (1.0 - draw) * win_rate;
    let loss = (1.0 - draw) * (1.0 - win_rate);
    (
        win.max(1e-12),
        draw.max(1e-12),
        loss.max(1e-12),
    )
}
