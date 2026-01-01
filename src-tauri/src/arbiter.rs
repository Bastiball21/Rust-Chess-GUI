use crate::uci::AsyncEngine;
use crate::types::{MatchConfig, GameUpdate, EngineStats};
use shakmaty::{Chess, Position, Move, Role, Color, uci::Uci};
use shakmaty::fen::Fen;
use tokio::sync::mpsc;
use tokio::time::{Instant, Duration, sleep};
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct Arbiter {
    white_engine: AsyncEngine,
    black_engine: AsyncEngine,
    match_config: MatchConfig,
    game_update_tx: mpsc::Sender<GameUpdate>,
    stats_tx: mpsc::Sender<EngineStats>,
    should_stop: Arc<Mutex<bool>>,
}

impl Arbiter {
    pub async fn new(
        match_config: MatchConfig,
        game_update_tx: mpsc::Sender<GameUpdate>,
        stats_tx: mpsc::Sender<EngineStats>,
    ) -> anyhow::Result<Self> {
        let white_engine = AsyncEngine::spawn(&match_config.white.path).await?;
        let black_engine = AsyncEngine::spawn(&match_config.black.path).await?;

        let mut white_rx = white_engine.stdout_broadcast.subscribe();
        let mut black_rx = black_engine.stdout_broadcast.subscribe();

        // Handle engine output in background for stats
        let stats_tx_clone = stats_tx.clone();
        tokio::spawn(async move {
            while let Ok(line) = white_rx.recv().await {
                if line.starts_with("info") {
                    if let Some(stats) = parse_info(&line, 0) {
                        let _ = stats_tx_clone.send(stats).await;
                    }
                }
            }
        });

        let stats_tx_clone2 = stats_tx.clone();
        tokio::spawn(async move {
            while let Ok(line) = black_rx.recv().await {
                 if line.starts_with("info") {
                    if let Some(stats) = parse_info(&line, 1) {
                        let _ = stats_tx_clone2.send(stats).await;
                    }
                }
            }
        });

        Ok(Self {
            white_engine,
            black_engine,
            match_config,
            game_update_tx,
            stats_tx,
            should_stop: Arc::new(Mutex::new(false)),
        })
    }

    pub async fn run_match(&self) -> anyhow::Result<()> {
        let mut pos = Chess::default();

        self.white_engine.send("uci".into()).await?;
        self.black_engine.send("uci".into()).await?;
        sleep(Duration::from_millis(100)).await;

        self.white_engine.send("isready".into()).await?;
        self.black_engine.send("isready".into()).await?;
        sleep(Duration::from_millis(100)).await;

        self.white_engine.send("ucinewgame".into()).await?;
        self.black_engine.send("ucinewgame".into()).await?;

        let mut white_time = self.match_config.time_control.base_ms as i64;
        let mut black_time = self.match_config.time_control.base_ms as i64;
        let inc = self.match_config.time_control.inc_ms as i64;

        let mut moves_history: Vec<String> = Vec::new();

        loop {
            if *self.should_stop.lock().await {
                break;
            }

            if pos.is_game_over() {
                let outcome = pos.outcome().unwrap();
                let result_str = match outcome {
                    shakmaty::Outcome::Decisive { winner: Color::White } => "1-0",
                    shakmaty::Outcome::Decisive { winner: Color::Black } => "0-1",
                    shakmaty::Outcome::Draw => "1/2-1/2",
                };

                 self.game_update_tx.send(GameUpdate {
                    fen: Fen::from_position(pos.clone(), shakmaty::EnPassantMode::Legal).to_string(),
                    last_move: None,
                    white_time: white_time as u64,
                    black_time: black_time as u64,
                    move_number: (moves_history.len() / 2 + 1) as u32,
                    result: Some(result_str.to_string()),
                }).await?;
                break;
            }

            let turn = pos.turn();
            let (active_engine, time_left, other_time) = match turn {
                Color::White => (&self.white_engine, white_time, black_time),
                Color::Black => (&self.black_engine, black_time, white_time),
            };

            let mut pos_cmd = "position startpos moves".to_string();
            for m in &moves_history {
                pos_cmd.push_str(" ");
                pos_cmd.push_str(m);
            }
            active_engine.send(pos_cmd).await?;

            let go_cmd = format!("go wtime {} btime {} winc {} binc {}", white_time, black_time, inc, inc);

            // Subscribe BEFORE sending go to avoid missing fast responses
            let mut active_rx = active_engine.stdout_broadcast.subscribe();

            active_engine.send(go_cmd).await?;

            let start = Instant::now();
            let mut best_move_str = String::new();

            while let Ok(line) = active_rx.recv().await {
                if line.starts_with("bestmove") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() > 1 {
                        best_move_str = parts[1].to_string();
                    }
                    break;
                }
            }

            let elapsed = start.elapsed().as_millis() as i64;
            match turn {
                Color::White => white_time = (white_time - elapsed).max(0) + inc,
                Color::Black => black_time = (black_time - elapsed).max(0) + inc,
            }

            // Apply move
            // shakmaty needs Uci move to Move
            let uci_move: Uci = best_move_str.parse().unwrap_or_else(|_| Uci::from_ascii(b"0000").unwrap());
            if let Ok(m) = uci_move.to_move(&pos) {
                pos.play_unchecked(&m);
                moves_history.push(best_move_str.clone());
            } else {
                 // Illegal move or game end?
                 // For now, treat as resign or error
                 println!("Illegal move from engine: {}", best_move_str);
                 break;
            }

            self.game_update_tx.send(GameUpdate {
                    fen: Fen::from_position(pos.clone(), shakmaty::EnPassantMode::Legal).to_string(),
                    last_move: Some(best_move_str),
                    white_time: white_time as u64,
                    black_time: black_time as u64,
                    move_number: (moves_history.len() / 2 + 1) as u32,
                    result: None,
            }).await?;

            // Small sleep to avoid spamming if engines are super fast (instant moves)
            // sleep(Duration::from_millis(50)).await;
        }

        Ok(())
    }

    pub async fn stop(&self) {
        *self.should_stop.lock().await = true;
        let _ = self.white_engine.quit().await;
        let _ = self.black_engine.quit().await;
    }
}

fn parse_info(line: &str, engine_idx: usize) -> Option<EngineStats> {
    let mut depth = 0;
    let mut nodes = 0;
    let mut score_cp = None;
    let mut score_mate = None;
    let mut pv = String::new();
    let mut nps = 0;

    let parts: Vec<&str> = line.split_whitespace().collect();
    let mut i = 0;
    while i < parts.len() {
        match parts[i] {
            "depth" => { if i+1 < parts.len() { depth = parts[i+1].parse().unwrap_or(0); } },
            "nodes" => { if i+1 < parts.len() { nodes = parts[i+1].parse().unwrap_or(0); } },
            "nps" => { if i+1 < parts.len() { nps = parts[i+1].parse().unwrap_or(0); } },
            "score" => {
                if i+2 < parts.len() {
                    let kind = parts[i+1];
                    let val = parts[i+2].parse().unwrap_or(0);
                    if kind == "cp" { score_cp = Some(val); }
                    else if kind == "mate" { score_mate = Some(val); }
                    i += 2;
                }
            },
            "pv" => {
                pv = parts[i+1..].join(" ");
                break;
            }
            _ => {}
        }
        i += 1;
    }

    Some(EngineStats {
        depth, score_cp, score_mate, nodes, nps, pv, engine_idx
    })
}
