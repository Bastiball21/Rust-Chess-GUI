use crate::uci::AsyncEngine;
use crate::types::{TournamentConfig, TournamentMode, GameUpdate, EngineStats, ScheduledGame};
use crate::stats::TournamentStats;
use shakmaty::{Chess, Position, Move, Role, Color, uci::Uci, CastlingMode, Outcome};
use shakmaty::fen::Fen;
use tokio::sync::{mpsc, Semaphore};
use tokio::time::{Instant, Duration, sleep};
use std::sync::Arc;
use tokio::sync::Mutex;
use rand::seq::SliceRandom;
use rand::prelude::IndexedRandom;
use std::io::BufRead;

enum Board {
    Standard(Chess),
    Chess960(Chess),
}

impl Board {
    fn turn(&self) -> Color { match self { Self::Standard(b) | Self::Chess960(b) => b.turn() } }
    fn is_game_over(&self) -> bool { match self { Self::Standard(b) | Self::Chess960(b) => b.is_game_over() } }
    fn outcome(&self) -> Option<Outcome> { match self { Self::Standard(b) | Self::Chess960(b) => b.outcome() } }
    fn play_unchecked(&mut self, m: &Move) { match self { Self::Standard(b) | Self::Chess960(b) => b.play_unchecked(m) } }
    fn to_fen_string(&self) -> String {
        match self {
            Self::Standard(b) => Fen::from_position(b.clone(), shakmaty::EnPassantMode::Legal).to_string(),
            Self::Chess960(b) => Fen::from_position(b.clone(), shakmaty::EnPassantMode::Legal).to_string()
        }
    }
}

pub struct Arbiter {
    active_engines: Arc<Mutex<Vec<AsyncEngine>>>,
    config: TournamentConfig,
    game_update_tx: mpsc::Sender<GameUpdate>,
    stats_tx: mpsc::Sender<EngineStats>,
    tourney_stats_tx: mpsc::Sender<TournamentStats>,
    pgn_tx: mpsc::Sender<String>,
    schedule_update_tx: mpsc::Sender<ScheduledGame>, // Channel for schedule updates
    should_stop: Arc<Mutex<bool>>,
    is_paused: Arc<Mutex<bool>>,
    openings: Vec<String>,
    tourney_stats: Arc<Mutex<TournamentStats>>,
}

impl Arbiter {
    pub async fn new(
        config: TournamentConfig,
        game_update_tx: mpsc::Sender<GameUpdate>,
        stats_tx: mpsc::Sender<EngineStats>,
        tourney_stats_tx: mpsc::Sender<TournamentStats>,
        schedule_update_tx: mpsc::Sender<ScheduledGame> // Added
    ) -> anyhow::Result<Self> {
        let mut openings = Vec::new();
        if let Some(ref path) = config.opening_file {
            openings = load_openings(path).unwrap_or_default();
        }

        let (pgn_tx, mut pgn_rx) = mpsc::channel::<String>(100);

        tokio::spawn(async move {
             use std::io::Write;
             while let Some(pgn) = pgn_rx.recv().await {
                 if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open("tournament.pgn") {
                     let _ = file.write_all(pgn.as_bytes());
                 }
             }
        });

        Ok(Self {
            active_engines: Arc::new(Mutex::new(Vec::new())),
            config,
            game_update_tx,
            stats_tx,
            tourney_stats_tx,
            pgn_tx,
            schedule_update_tx,
            should_stop: Arc::new(Mutex::new(false)),
            is_paused: Arc::new(Mutex::new(false)),
            openings,
            tourney_stats: Arc::new(Mutex::new(TournamentStats::default())),
        })
    }

    pub async fn set_paused(&self, paused: bool) { *self.is_paused.lock().await = paused; }

    fn generate_pairings(&self) -> Vec<(usize, usize)> {
        let n = self.config.engines.len();
        let mut pairings = Vec::new();
        match self.config.mode {
            TournamentMode::Match => {
                if n >= 2 { pairings.push((0, 1)); }
            },
            TournamentMode::Gauntlet => {
                if n >= 2 {
                    for i in 1..n { pairings.push((0, i)); }
                }
            },
            TournamentMode::RoundRobin => {
                for i in 0..n {
                    for j in i+1..n {
                        pairings.push((i, j));
                    }
                }
            }
        }
        pairings
    }

    pub async fn run_tournament(&self) -> anyhow::Result<()> {
        let pairings = self.generate_pairings();
        let games_count = self.config.games_count.max(1);

        let semaphore = Arc::new(Semaphore::new(4));

        let mut tasks = Vec::new();
        let mut game_tasks = Vec::new();
        let mut schedule_list = Vec::new();

        let mut game_id_counter = 0;
        for (idx_a, idx_b) in pairings {
            for i in 0..games_count {
                // Determine names for schedule
                let (white_idx, black_idx) = if self.config.swap_sides && i % 2 != 0 {
                    (idx_b, idx_a)
                } else {
                    (idx_a, idx_b)
                };
                let white_name = self.config.engines[white_idx].name.clone();
                let black_name = self.config.engines[black_idx].name.clone();

                game_id_counter += 1;
                let scheduled_game = ScheduledGame {
                    id: game_id_counter,
                    white_name: white_name.clone(),
                    black_name: black_name.clone(),
                    state: "Pending".to_string(),
                    result: None,
                };
                schedule_list.push(scheduled_game.clone());

                // Send initial pending state
                let _ = self.schedule_update_tx.send(scheduled_game).await;

                game_tasks.push((idx_a, idx_b, i, game_id_counter));
            }
        }

        // We could send the full list as a "batch" here, but for simplicity we rely on individual "Pending" events
        // sent above. The frontend can accumulate them.
        // Actually, individual events might arrive out of order or be slow.
        // It's better if the frontend clears schedule on start.

        for (idx_a, idx_b, game_idx, game_id) in game_tasks {
             if *self.should_stop.lock().await { break; }

             let permit = semaphore.clone().acquire_owned().await?;

             let config = self.config.clone();
             let should_stop = self.should_stop.clone();
             let is_paused = self.is_paused.clone();
             let active_engines = self.active_engines.clone();
             let game_update_tx = self.game_update_tx.clone();
             let stats_tx = self.stats_tx.clone();
             let tourney_stats_tx = self.tourney_stats_tx.clone();
             let tourney_stats = self.tourney_stats.clone();
             let pgn_tx = self.pgn_tx.clone();
             let schedule_update_tx = self.schedule_update_tx.clone();
             let openings = self.openings.clone();

             let task = tokio::spawn(async move {
                let _permit = permit;
                if *should_stop.lock().await { return; }

                let (white_engine_idx, black_engine_idx) = if config.swap_sides && game_idx % 2 != 0 {
                    (idx_b, idx_a)
                } else {
                    (idx_a, idx_b)
                };

                let white_name = config.engines[white_engine_idx].name.clone();
                let black_name = config.engines[black_engine_idx].name.clone();

                // Notify Active
                let _ = schedule_update_tx.send(ScheduledGame {
                    id: game_id,
                    white_name: white_name.clone(),
                    black_name: black_name.clone(),
                    state: "Active".to_string(),
                    result: None
                }).await;

                let eng_a_config = &config.engines[idx_a];
                let eng_b_config = &config.engines[idx_b];

                let engine_a = match AsyncEngine::spawn(&eng_a_config.path).await {
                    Ok(e) => e,
                    Err(e) => { println!("Failed to spawn engine {}: {}", eng_a_config.name, e); return; }
                };
                let engine_b = match AsyncEngine::spawn(&eng_b_config.path).await {
                    Ok(e) => e,
                    Err(e) => { println!("Failed to spawn engine {}: {}", eng_b_config.name, e); return; }
                };

                if config.variant == "chess960" {
                    let _ = engine_a.send("setoption name UCI_Chess960 value true".into()).await;
                    let _ = engine_b.send("setoption name UCI_Chess960 value true".into()).await;
                }

                {
                    let mut active = active_engines.lock().await;
                    active.push(engine_a.clone());
                    active.push(engine_b.clone());
                }

                let mut a_rx = engine_a.stdout_broadcast.subscribe();
                let mut b_rx = engine_b.stdout_broadcast.subscribe();
                let stats_tx_a = stats_tx.clone();
                let stats_tx_b = stats_tx.clone();
                let idx_a_val = idx_a;
                let idx_b_val = idx_b;

                let stop_listen_a = should_stop.clone();
                tokio::spawn(async move {
                    while let Ok(line) = a_rx.recv().await {
                        if *stop_listen_a.lock().await { break; }
                        if line.starts_with("info") { if let Some(stats) = parse_info(&line, idx_a_val) { let _ = stats_tx_a.send(stats).await; } }
                    }
                });
                let stop_listen_b = should_stop.clone();
                tokio::spawn(async move {
                    while let Ok(line) = b_rx.recv().await {
                         if *stop_listen_b.lock().await { break; }
                         if line.starts_with("info") { if let Some(stats) = parse_info(&line, idx_b_val) { let _ = stats_tx_b.send(stats).await; } }
                    }
                });

                let (white_engine, black_engine, white_idx, black_idx) = if config.swap_sides && game_idx % 2 != 0 {
                    (&engine_b, &engine_a, idx_b, idx_a)
                } else {
                    (&engine_a, &engine_b, idx_a, idx_b)
                };

                let start_fen = if !openings.is_empty() {
                    let idx = if config.swap_sides { (game_idx / 2) as usize } else { game_idx as usize };
                    openings[idx % openings.len()].clone()
                } else if let Some(ref f) = config.opening_fen {
                    if !f.trim().is_empty() { f.clone() } else { generate_start_fen(&config.variant) }
                } else {
                    generate_start_fen(&config.variant)
                };

                let res = play_game_static(
                    white_engine, black_engine, white_idx, black_idx, &start_fen,
                    &config, &game_update_tx, &should_stop, &is_paused
                ).await;

                if let Ok((result, moves_played)) = res {
                    // Notify Finished
                    let _ = schedule_update_tx.send(ScheduledGame {
                        id: game_id,
                        white_name: white_name.clone(),
                        black_name: black_name.clone(),
                        state: "Finished".to_string(),
                        result: Some(result.clone())
                    }).await;

                    let white_name_pgn = &config.engines[white_idx].name;
                    let black_name_pgn = &config.engines[black_idx].name;
                    let pgn = format_pgn(&moves_played, &result, white_name_pgn, black_name_pgn, &start_fen);
                    let _ = pgn_tx.send(pgn).await;

                    {
                        let mut stats = tourney_stats.lock().await;
                        let is_white_a = white_idx == 0;
                        stats.update(&result, is_white_a);
                        let _ = tourney_stats_tx.send(stats.clone()).await;
                    }
                } else {
                     // Notify Error/Stopped
                     let _ = schedule_update_tx.send(ScheduledGame {
                        id: game_id,
                        white_name: white_name.clone(),
                        black_name: black_name.clone(),
                        state: "Aborted".to_string(),
                        result: None
                    }).await;
                }

                let _ = engine_a.quit().await;
                let _ = engine_b.quit().await;
             });

             tasks.push(task);
        }

        for task in tasks {
            let _ = task.await;
        }

        {
            let mut active = self.active_engines.lock().await;
            active.clear();
        }

        Ok(())
    }

    pub async fn stop(&self) {
        *self.should_stop.lock().await = true;
        let mut active = self.active_engines.lock().await;
        for engine in active.iter() {
            let _ = engine.quit().await;
        }
        active.clear();
    }
}

fn generate_start_fen(variant: &str) -> String {
    if variant == "chess960" {
        let _pieces = vec![Role::Rook, Role::Knight, Role::Bishop, Role::Queen, Role::King, Role::Bishop, Role::Knight, Role::Rook];
        let mut rng = rand::rng();
        let mut dark_squares = vec![0, 2, 4, 6]; let mut light_squares = vec![1, 3, 5, 7];
        let b1_pos = *dark_squares.choose(&mut rng).unwrap();
        let b2_pos = *light_squares.choose(&mut rng).unwrap();
        let mut empty: Vec<usize> = (0..8).filter(|&i| i != b1_pos && i != b2_pos).collect();
        empty.shuffle(&mut rng);
        let q_pos = empty[0]; let n1_pos = empty[1]; let n2_pos = empty[2];
        let mut rem: Vec<usize> = empty[3..].to_vec(); rem.sort();
        let r1_pos = rem[0]; let k_pos = rem[1]; let r2_pos = rem[2];
        let mut rank = vec![Role::Pawn; 8];
        rank[b1_pos] = Role::Bishop; rank[b2_pos] = Role::Bishop; rank[q_pos] = Role::Queen;
        rank[n1_pos] = Role::Knight; rank[n2_pos] = Role::Knight; rank[r1_pos] = Role::Rook;
        rank[k_pos] = Role::King; rank[r2_pos] = Role::Rook;
        let mut fen = String::new();
        for p in &rank { fen.push(p.upper_char()); }
        fen.push_str("/pppppppp/8/8/8/8/PPPPPPPP/");
        for p in &rank { fen.push(p.char()); }
        fen.push_str(" w KQkq - 0 1");
        fen
    } else { "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1".to_string() }
}

fn format_pgn(moves: &[String], result: &str, white_name: &str, black_name: &str, start_fen: &str) -> String {
     let mut pgn = String::new();
     pgn.push_str("[Event \"Mini-TCEC Tournament\"]\n");
     pgn.push_str("[Site \"Mini-TCEC\"]\n");
     pgn.push_str("[Date \"????.??.??\"]\n");
     pgn.push_str("[Round \"-\"]\n");
     pgn.push_str(&format!("[White \"{}\"]\n", white_name));
     pgn.push_str(&format!("[Black \"{}\"]\n", black_name));
     pgn.push_str(&format!("[Result \"{}\"]\n", result));
     if start_fen != "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" {
         pgn.push_str(&format!("[FEN \"{}\"]\n", start_fen));
         pgn.push_str("[SetUp \"1\"]\n");
     }
     pgn.push_str("\n");

     for (i, m) in moves.iter().enumerate() {
         if i % 2 == 0 {
             pgn.push_str(&format!("{}. ", i / 2 + 1));
         }
         pgn.push_str(m);
         pgn.push_str(" ");
     }
     pgn.push_str(result);
     pgn.push_str("\n\n");
     pgn
}

async fn play_game_static(
    white_engine: &AsyncEngine,
    black_engine: &AsyncEngine,
    white_idx: usize,
    black_idx: usize,
    start_fen: &str,
    config: &TournamentConfig,
    game_update_tx: &mpsc::Sender<GameUpdate>,
    should_stop: &Arc<Mutex<bool>>,
    is_paused: &Arc<Mutex<bool>>
) -> anyhow::Result<(String, Vec<String>)> {
    let is_960 = config.variant == "chess960";
    let mut pos: Board = if is_960 {
         let setup = Fen::from_ascii(start_fen.as_bytes())?;
         let pos_960: Chess = setup.into_position(CastlingMode::Chess960)?;
         Board::Chess960(pos_960)
    } else {
         let setup = Fen::from_ascii(start_fen.as_bytes())?;
         let pos_std: Chess = setup.into_position(CastlingMode::Standard)?;
         Board::Standard(pos_std)
    };

    white_engine.send("uci".into()).await?; black_engine.send("uci".into()).await?;
    sleep(Duration::from_millis(50)).await;
    white_engine.send("ucinewgame".into()).await?; black_engine.send("ucinewgame".into()).await?;

    let mut white_time = config.time_control.base_ms as i64;
    let mut black_time = config.time_control.base_ms as i64;
    let inc = config.time_control.inc_ms as i64;
    let mut moves_history: Vec<String> = Vec::new();

    let mut consec_resign_moves = 0;
    let mut consec_draw_moves = 0;
    let mut game_result = "*".to_string();

    loop {
        if *should_stop.lock().await { return Ok(("stopped".to_string(), moves_history)); }
        if *is_paused.lock().await { sleep(Duration::from_millis(100)).await; continue; }

        // Material Draw Adjudication (Strict K vs K or Insufficient Material)
        // We strictly check for *insufficient material* to avoid drawing winning K+P positions.
        // If is_insufficient_material() is not available, we default to "Only Kings" (no pawns, no other pieces).
        let material_draw = match &pos {
             Board::Standard(b) => b.is_insufficient_material(),
             Board::Chess960(b) => b.is_insufficient_material(),
        };

        if material_draw {
             game_result = "1/2-1/2".to_string();
             let _ = game_update_tx.send(GameUpdate {
                fen: pos.to_fen_string(), last_move: None, white_time: white_time as u64, black_time: black_time as u64,
                move_number: (moves_history.len() / 2 + 1) as u32, result: Some(game_result.clone()), white_engine_idx: white_idx, black_engine_idx: black_idx,
            }).await;
            break;
        }

        if pos.is_game_over() {
            let outcome = pos.outcome().unwrap();
            let result_str = match outcome {
                shakmaty::Outcome::Decisive { winner: Color::White } => "1-0",
                shakmaty::Outcome::Decisive { winner: Color::Black } => "0-1",
                shakmaty::Outcome::Draw => "1/2-1/2",
            };
            game_result = result_str.to_string();
            let _ = game_update_tx.send(GameUpdate {
                fen: pos.to_fen_string(), last_move: None, white_time: white_time as u64, black_time: black_time as u64,
                move_number: (moves_history.len() / 2 + 1) as u32, result: Some(result_str.to_string()), white_engine_idx: white_idx, black_engine_idx: black_idx,
            }).await;
            break;
        }

        let turn = pos.turn();
        let (active_engine, _time_left, _other_time) = match turn {
            Color::White => (white_engine, white_time, black_time),
            Color::Black => (black_engine, black_time, white_time),
        };

        let mut pos_cmd = format!("position fen {} moves", start_fen);
        for m in &moves_history { pos_cmd.push_str(" "); pos_cmd.push_str(m); }
        active_engine.send(pos_cmd).await?;

        let go_cmd = format!("go wtime {} btime {} winc {} binc {}", white_time, black_time, inc, inc);
        let mut active_rx = active_engine.stdout_broadcast.subscribe();
        active_engine.send(go_cmd).await?;

        let start = Instant::now();
        let mut best_move_str = String::new();
        let mut move_score: Option<i32> = None;

        while let Ok(line) = active_rx.recv().await {
            if line.starts_with("info") {
                if let Some(stats) = parse_info(&line, 0) {
                    if let Some(cp) = stats.score_cp {
                         move_score = Some(cp);
                    } else if let Some(mate) = stats.score_mate {
                         move_score = Some(if mate > 0 { 30000 - mate } else { -30000 - mate });
                    }
                }
            }
            if line.starts_with("bestmove") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() > 1 { best_move_str = parts[1].to_string(); }
                break;
            }
        }

        let elapsed = start.elapsed().as_millis() as i64;
        match turn {
            Color::White => white_time = (white_time - elapsed).max(0) + inc,
            Color::Black => black_time = (black_time - elapsed).max(0) + inc,
        }

        // Adjudication Checks
        if let Some(score) = move_score {
             if score.abs() > 1000 {
                 consec_resign_moves += 1;
             } else {
                 consec_resign_moves = 0;
             }

             let move_num = (moves_history.len() / 2) + 1;
             if move_num >= 40 {
                 if score.abs() <= 5 {
                     consec_draw_moves += 1;
                 } else {
                     consec_draw_moves = 0;
                 }
             } else {
                 consec_draw_moves = 0;
             }
        }

        if consec_resign_moves >= 5 {
             let result_str = if let Some(s) = move_score {
                 if s > 0 {
                     match turn { Color::White => "1-0", Color::Black => "0-1" }
                 } else {
                     match turn { Color::White => "0-1", Color::Black => "1-0" }
                 }
             } else { "1/2-1/2" };

             game_result = result_str.to_string();
             let _ = game_update_tx.send(GameUpdate {
                fen: pos.to_fen_string(), last_move: Some(best_move_str.clone()), white_time: white_time as u64, black_time: black_time as u64,
                move_number: (moves_history.len() / 2 + 1) as u32, result: Some(result_str.to_string()), white_engine_idx: white_idx, black_engine_idx: black_idx,
            }).await;
            break;
        }

        if consec_draw_moves >= 20 {
             game_result = "1/2-1/2".to_string();
             let _ = game_update_tx.send(GameUpdate {
                fen: pos.to_fen_string(), last_move: Some(best_move_str.clone()), white_time: white_time as u64, black_time: black_time as u64,
                move_number: (moves_history.len() / 2 + 1) as u32, result: Some("1/2-1/2".to_string()), white_engine_idx: white_idx, black_engine_idx: black_idx,
            }).await;
            break;
        }

        let parsed_move = match &mut pos {
            Board::Standard(b) => { let uci: Uci = best_move_str.parse().unwrap_or_else(|_| Uci::from_ascii(b"0000").unwrap()); uci.to_move(b) },
            Board::Chess960(b) => { let uci: Uci = best_move_str.parse().unwrap_or_else(|_| Uci::from_ascii(b"0000").unwrap()); uci.to_move(b) }
        };

        if let Ok(m) = parsed_move {
            pos.play_unchecked(&m);
            moves_history.push(best_move_str.clone());
        } else {
             println!("Illegal/Unparseable move: {}", best_move_str);
             game_result = "*".to_string();
             break;
        }

        let _ = game_update_tx.send(GameUpdate {
            fen: pos.to_fen_string(), last_move: Some(best_move_str), white_time: white_time as u64, black_time: black_time as u64,
            move_number: (moves_history.len() / 2 + 1) as u32, result: None, white_engine_idx: white_idx, black_engine_idx: black_idx,
        }).await;
    }
    Ok((game_result, moves_history))
}

fn load_openings(path: &str) -> Option<Vec<String>> {
    let file = std::fs::File::open(path).ok()?;
    let reader = std::io::BufReader::new(file);
    let mut fens = Vec::new();
    let is_pgn = path.ends_with(".pgn");

    for line_res in reader.lines() {
        if let Ok(line) = line_res {
            let line = line.trim();
            if line.is_empty() { continue; }
            if is_pgn {
                // Simple PGN FEN extraction
                if line.starts_with("[FEN \"") && line.ends_with("\"]") {
                    let fen = &line[6..line.len()-2];
                    fens.push(fen.to_string());
                }
            } else {
                // Assume EPD: take everything before first " ;" or just the whole line if clean
                let parts: Vec<&str> = line.split(';').collect();
                fens.push(parts[0].trim().to_string());
            }
        }
    }
    if fens.is_empty() { None } else { Some(fens) }
}

fn parse_info(line: &str, engine_idx: usize) -> Option<EngineStats> {
    let mut depth = 0; let mut nodes = 0; let mut score_cp = None; let mut score_mate = None; let mut pv = String::new(); let mut nps = 0;
    let parts: Vec<&str> = line.split_whitespace().collect();
    let mut i = 0;
    while i < parts.len() {
        match parts[i] {
            "depth" => { if i+1 < parts.len() { depth = parts[i+1].parse().unwrap_or(0); } },
            "nodes" => { if i+1 < parts.len() { nodes = parts[i+1].parse().unwrap_or(0); } },
            "nps" => { if i+1 < parts.len() { nps = parts[i+1].parse().unwrap_or(0); } },
            "score" => { if i+2 < parts.len() { let kind = parts[i+1]; let val = parts[i+2].parse().unwrap_or(0); if kind == "cp" { score_cp = Some(val); } else if kind == "mate" { score_mate = Some(val); } i += 2; } },
            "pv" => { pv = parts[i+1..].join(" "); break; }
            _ => {}
        }
        i += 1;
    }
    Some(EngineStats { depth, score_cp, score_mate, nodes, nps, pv, engine_idx })
}
