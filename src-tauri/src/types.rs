use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EngineConfig {
    pub name: String,
    pub path: String,
    pub options: Vec<(String, String)>,
    pub country_code: Option<String>, // Added country_code
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum TournamentMode {
    Match,
    RoundRobin,
    Gauntlet,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TournamentConfig {
    pub mode: TournamentMode,
    pub engines: Vec<EngineConfig>,
    pub time_control: TimeControl,
    pub games_count: u32,
    pub swap_sides: bool,
    pub opening_fen: Option<String>,
    pub opening_file: Option<String>,
    pub opening_order: Option<String>,
    pub variant: String,
    pub concurrency: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TimeControl { pub base_ms: u64, pub inc_ms: u64 }

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GameUpdate {
    pub fen: String, pub last_move: Option<String>, pub white_time: u64, pub black_time: u64,
    pub move_number: u32, pub result: Option<String>, pub white_engine_idx: usize, pub black_engine_idx: usize,
    pub game_id: usize,
}

// New struct for frequent time updates
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TimeUpdate {
    pub white_time: u64,
    pub black_time: u64,
    pub game_id: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EngineStats {
    pub depth: u32, pub score_cp: Option<i32>, pub score_mate: Option<i32>,
    pub nodes: u64, pub nps: u64, pub pv: String, pub engine_idx: usize,
    pub game_id: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ScheduledGame {
    pub id: usize,
    pub white_name: String,
    pub black_name: String,
    pub state: String,
    pub result: Option<String>,
}
