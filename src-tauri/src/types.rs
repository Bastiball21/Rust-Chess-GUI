use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EngineConfig {
    pub id: Option<String>,
    pub name: String,
    pub path: String,
    pub options: Vec<(String, String)>,
    pub country_code: Option<String>,
    pub args: Option<Vec<String>>,
    pub working_directory: Option<String>,
    pub protocol: Option<String>, // "uci" or "xboard", default "uci"
    pub logo_path: Option<String>, // Path to engine logo image
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum TournamentMode {
    Match,
    RoundRobin,
    Gauntlet,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AdjudicationConfig {
    pub resign_score: Option<i32>,      // cp
    pub resign_move_count: Option<u32>, // consecutive moves
    pub draw_score: Option<i32>,        // cp
    pub draw_move_number: Option<u32>,  // start checking after this move
    pub draw_move_count: Option<u32>,   // consecutive moves within score
    pub result_adjudication: bool,      // Syzygy/TB adjudication (implied)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OpeningConfig {
    pub file: Option<String>,           // PGN/EPD/FEN file path
    pub fen: Option<String>,            // Direct FEN string
    pub depth: Option<u32>,             // Moves to play from book
    pub order: Option<String>,          // "random", "sequential"
    pub book_path: Option<String>,      // Polyglot bin book path
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TournamentConfig {
    pub mode: TournamentMode,
    pub engines: Vec<EngineConfig>,
    pub time_control: TimeControl,
    pub games_count: u32,
    pub swap_sides: bool,
    pub opening: OpeningConfig,
    pub variant: String,
    pub concurrency: Option<u32>,
    pub pgn_path: Option<String>,
    pub event_name: Option<String>,
    pub disabled_engine_ids: Vec<String>,
    pub resume_state_path: Option<String>,
    #[serde(default)]
    pub resume_from_state: bool,
    pub adjudication: AdjudicationConfig,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TimeControl { pub base_ms: u64, pub inc_ms: u64 }

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GameUpdate {
    pub fen: String, pub last_move: Option<String>, pub white_time: u64, pub black_time: u64,
    pub move_number: u32, pub result: Option<String>, pub white_engine_idx: usize, pub black_engine_idx: usize,
    pub game_id: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TournamentError {
    pub engine_id: Option<String>,
    pub engine_name: String,
    pub game_id: Option<usize>,
    pub message: String,
    pub failure_count: u32,
    pub disabled: bool,
}

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
    pub tb_hits: Option<u64>, // Added
    pub hash_full: Option<u32>, // Added
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ScheduledGame {
    pub id: usize,
    pub white_name: String,
    pub black_name: String,
    pub state: String,
    pub result: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TournamentResumeState {
    pub config: TournamentConfig,
    pub schedule: Vec<ScheduledGame>,
}

// UCI Option Types for Frontend
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UciOption {
    pub name: String,
    pub option_type: String, // "check", "spin", "combo", "button", "string"
    pub default: Option<String>,
    pub min: Option<i32>,
    pub max: Option<i32>,
    pub var: Vec<String>, // For combos
}

// Standings Structs
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct Standings {
    pub entries: Vec<StandingsEntry>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct StandingsEntry {
    pub rank: u32,
    pub engine_name: String,
    pub engine_id: Option<String>,
    pub games_played: u32,
    pub points: f64,
    pub score_percent: f64,
    pub wins: u32,
    pub losses: u32,
    pub draws: u32,
    pub crashes: u32,
    pub sb: f64, // Sonneborn-Berger
    pub elo: f64,
    pub elo_diff: Option<f64>,
}
