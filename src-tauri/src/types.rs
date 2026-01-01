use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EngineConfig {
    pub name: String,
    pub path: String,
    pub options: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MatchConfig {
    pub white: EngineConfig,
    pub black: EngineConfig,
    pub time_control: TimeControl, // e.g. "1+0.1"
    pub games_count: u32,
    pub swap_sides: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TimeControl {
    pub base_ms: u64,
    pub inc_ms: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GameUpdate {
    pub fen: String,
    pub last_move: Option<String>, // UCI format
    pub white_time: u64,
    pub black_time: u64,
    pub move_number: u32,
    pub result: Option<String>,
    pub white_engine_idx: usize, // 0 for engine_a, 1 for engine_b
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EngineStats {
    pub depth: u32,
    pub score_cp: Option<i32>,
    pub score_mate: Option<i32>,
    pub nodes: u64,
    pub nps: u64,
    pub pv: String,
    pub engine_idx: usize, // 0 for engine_a, 1 for engine_b
}
