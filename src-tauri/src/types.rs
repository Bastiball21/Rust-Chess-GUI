use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeControl {
    pub base_ms: u64,
    pub inc_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineConfig {
    pub name: String,
    pub path: String,
    pub options: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchConfig {
    pub white: EngineConfig,
    pub black: EngineConfig,
    pub time_control: TimeControl,
    pub games_count: u32,
    pub swap_sides: bool,
    pub opening_fen: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameUpdate {
    pub fen: String,
    pub last_move: Option<String>,
    pub white_time: u64,
    pub black_time: u64,
    pub move_number: u32,
    pub result: Option<String>,
    pub white_engine_idx: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineStats {
    pub engine_idx: usize,
    pub depth: u32,
    pub score_cp: i32,
    pub nodes: u64,
    pub nps: u64,
    pub pv: String,
    pub score_mate: Option<i32>,
}