use crate::uci::AsyncEngine;
use crate::types::{MatchConfig, GameUpdate, EngineStats};
use shakmaty::{Chess, Position, Move, Role, Color, uci::Uci, CastlingMode, Outcome};
use shakmaty::fen::Fen;
use tokio::sync::mpsc;
use tokio::time::{Instant, Duration, sleep};
use std::sync::Arc;
use tokio::sync::Mutex;
use rand::seq::SliceRandom;
use rand::prelude::IndexedRandom;

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
    engine_a: AsyncEngine, engine_b: AsyncEngine, match_config: MatchConfig,
    game_update_tx: mpsc::Sender<GameUpdate>, stats_tx: mpsc::Sender<EngineStats>,
    should_stop: Arc<Mutex<bool>>, is_paused: Arc<Mutex<bool>>,
}

impl Arbiter {
    pub async fn new(match_config: MatchConfig, game_update_tx: mpsc::Sender<GameUpdate>, stats_tx: mpsc::Sender<EngineStats>) -> anyhow::Result<Self> {
        let engine_a = AsyncEngine::spawn(&match_config.white.path).await?;
        let engine_b = AsyncEngine::spawn(&match_config.black.path).await?;
        if match_config.variant == "chess960" {
            engine_a.send("setoption name UCI_Chess960 value true".into()).await?;
            engine_b.send("setoption name UCI_Chess960 value true".into()).await?;
        }
        let mut a_rx = engine_a.stdout_broadcast.subscribe();
        let mut b_rx = engine_b.stdout_broadcast.subscribe();
        let stats_tx_clone = stats_tx.clone();
        tokio::spawn(async move {
            while let Ok(line) = a_rx.recv().await {
                if line.starts_with("info") { if let Some(stats) = parse_info(&line, 0) { let _ = stats_tx_clone.send(stats).await; } }
            }
        });
        let stats_tx_clone2 = stats_tx.clone();
        tokio::spawn(async move {
            while let Ok(line) = b_rx.recv().await {
                if line.starts_with("info") { if let Some(stats) = parse_info(&line, 1) { let _ = stats_tx_clone2.send(stats).await; } }
            }
        });
        Ok(Self { engine_a, engine_b, match_config, game_update_tx, stats_tx, should_stop: Arc::new(Mutex::new(false)), is_paused: Arc::new(Mutex::new(false)) })
    }

    pub async fn set_paused(&self, paused: bool) { *self.is_paused.lock().await = paused; }

    pub async fn run_match(&self) -> anyhow::Result<()> {
        let games_count = self.match_config.games_count.max(1);
        for i in 0..games_count {
            if *self.should_stop.lock().await { break; }
            let (white_engine, black_engine, white_idx) = if self.match_config.swap_sides && i % 2 != 0 {
                (&self.engine_b, &self.engine_a, 1)
            } else { (&self.engine_a, &self.engine_b, 0) };

            let start_fen = if let Some(ref f) = self.match_config.opening_fen {
                if !f.trim().is_empty() { f.clone() } else { self.generate_start_fen() }
            } else { self.generate_start_fen() };

            self.play_game(white_engine, black_engine, white_idx, &start_fen).await?;
            sleep(Duration::from_millis(500)).await;
        }
        Ok(())
    }

    fn generate_start_fen(&self) -> String {
        if self.match_config.variant == "chess960" {
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

    async fn play_game(&self, white_engine: &AsyncEngine, black_engine: &AsyncEngine, white_idx: usize, start_fen: &str) -> anyhow::Result<()> {
        let is_960 = self.match_config.variant == "chess960";
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

        let mut white_time = self.match_config.time_control.base_ms as i64;
        let mut black_time = self.match_config.time_control.base_ms as i64;
        let inc = self.match_config.time_control.inc_ms as i64;
        let mut moves_history: Vec<String> = Vec::new();

        loop {
            if *self.should_stop.lock().await { break; }
            if *self.is_paused.lock().await { sleep(Duration::from_millis(100)).await; continue; }

            if pos.is_game_over() {
                let outcome = pos.outcome().unwrap();
                let result_str = match outcome {
                    shakmaty::Outcome::Decisive { winner: Color::White } => "1-0",
                    shakmaty::Outcome::Decisive { winner: Color::Black } => "0-1",
                    shakmaty::Outcome::Draw => "1/2-1/2",
                };
                self.game_update_tx.send(GameUpdate {
                    fen: pos.to_fen_string(), last_move: None, white_time: white_time as u64, black_time: black_time as u64,
                    move_number: (moves_history.len() / 2 + 1) as u32, result: Some(result_str.to_string()), white_engine_idx: white_idx,
                }).await?;
                break;
            }

            let turn = pos.turn();
            let (active_engine, time_left, other_time) = match turn {
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
            while let Ok(line) = active_rx.recv().await {
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

            let parsed_move = match &mut pos {
                Board::Standard(b) => { let uci: Uci = best_move_str.parse().unwrap_or_else(|_| Uci::from_ascii(b"0000").unwrap()); uci.to_move(b) },
                Board::Chess960(b) => { let uci: Uci = best_move_str.parse().unwrap_or_else(|_| Uci::from_ascii(b"0000").unwrap()); uci.to_move(b) }
            };

            if let Ok(m) = parsed_move {
                pos.play_unchecked(&m);
                moves_history.push(best_move_str.clone());
            } else {
                 println!("Illegal/Unparseable move: {}", best_move_str);
                 break;
            }

            self.game_update_tx.send(GameUpdate {
                fen: pos.to_fen_string(), last_move: Some(best_move_str), white_time: white_time as u64, black_time: black_time as u64,
                move_number: (moves_history.len() / 2 + 1) as u32, result: None, white_engine_idx: white_idx,
            }).await?;
        }
        Ok(())
    }
    pub async fn stop(&self) { *self.should_stop.lock().await = true; let _ = self.engine_a.quit().await; let _ = self.engine_b.quit().await; }

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
