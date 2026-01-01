#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::*;
    use std::sync::Arc;
    use tokio::sync::mpsc;
    use std::path::PathBuf;

    #[tokio::test]
    async fn test_match_simulation() {
        // Path to mock-engine
        let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        path.push("target/debug/mock-engine");
        let path_str = path.to_str().unwrap().to_string();

        let config = MatchConfig {
            white: EngineConfig { name: "MockWhite".into(), path: path_str.clone(), options: vec![] },
            black: EngineConfig { name: "MockBlack".into(), path: path_str, options: vec![] },
            time_control: TimeControl { base_ms: 1000, inc_ms: 100 },
        };

        let (game_tx, mut game_rx) = mpsc::channel(100);
        let (stats_tx, mut stats_rx) = mpsc::channel(100);

        let arbiter = crate::arbiter::Arbiter::new(config, game_tx, stats_tx).await.expect("Failed to create arbiter");
        let arbiter = Arc::new(arbiter);

        // Run match in background
        let arbiter_clone = arbiter.clone();
        tokio::spawn(async move {
            if let Err(e) = arbiter_clone.run_match().await {
                 println!("Match finished with error/end: {}", e);
            }
        });

        // Listen for updates
        let mut moves = 0;
        let mut game_over = false;

        // We expect some moves and stats
        while let Some(update) = game_rx.recv().await {
            println!("Game Update: {:?}", update);
            if let Some(m) = update.last_move {
                moves += 1;
                println!("Move played: {}", m);
            }
            if update.result.is_some() {
                game_over = true;
                println!("Game Over: {:?}", update.result);
                break;
            }
            if moves >= 2 {
                // We just want to see if it starts and makes moves.
                // 1 move is enough to verify plumbing.
                break;
            }
        }

        arbiter.stop().await;

        // Ensure we got at least one move (White e2e4)
        assert!(moves >= 1, "Should have made at least one move");
    }
}
