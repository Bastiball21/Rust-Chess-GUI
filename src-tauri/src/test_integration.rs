#[cfg(test)]
mod tests {

    use crate::types::*;
    use std::path::PathBuf;
    use std::sync::Arc;
    use tokio::sync::mpsc;
    use uuid::Uuid;

    #[tokio::test]
    async fn test_match_simulation() {
        // Path to mock-engine
        let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        // Assuming mock-engine is built or we can point to it.
        path.push("target/debug/mock-engine");
        let path_str = path.to_str().unwrap().to_string();

        let config = TournamentConfig {
            mode: TournamentMode::Match,
            engines: vec![
                EngineConfig {
                    id: Some(Uuid::new_v4().to_string()),
                    name: "MockWhite".into(),
                    path: path_str.clone(),
                    options: vec![],
                    country_code: None,
                    args: None,
                    working_directory: None,
                },
                EngineConfig {
                    id: Some(Uuid::new_v4().to_string()),
                    name: "MockBlack".into(),
                    path: path_str,
                    options: vec![],
                    country_code: None,
                    args: None,
                    working_directory: None,
                },
            ],
            time_control: TimeControl {
                base_ms: 1000,
                inc_ms: 100,
            },
            games_count: 2,
            swap_sides: true,
            opening_fen: None,
            opening_file: None,
            opening_order: None,
            variant: "standard".to_string(),
            concurrency: Some(1),
            pgn_path: Some("test_tournament.pgn".to_string()),
            event_name: Some("Test Event".to_string()),
        };

        let (game_tx, mut game_rx) = mpsc::channel(100);
        let (stats_tx, _stats_rx) = mpsc::channel(100);
        let (tourney_stats_tx, _tourney_stats_rx) = mpsc::channel(100);
        let (schedule_update_tx, _schedule_update_rx) = mpsc::channel(100);

        let arbiter = crate::arbiter::Arbiter::new(
            config,
            game_tx,
            stats_tx,
            tourney_stats_tx,
            schedule_update_tx,
        )
        .await
        .expect("Failed to create arbiter");
        let arbiter = Arc::new(arbiter);

        // Run match in background
        let arbiter_clone = arbiter.clone();
        tokio::spawn(async move {
            if let Err(e) = arbiter_clone.run_tournament().await {
                println!("Match finished with error/end: {}", e);
            }
        });

        let mut moves = 0;
        // Listen for updates
        while let Some(update) = game_rx.recv().await {
            println!("Game Update: {:?}", update);
            if let Some(m) = update.last_move {
                moves += 1;
                println!("Move played: {}", m);
            }
            if update.result.is_some() {
                println!("Game Over: {:?}", update.result);
                break;
            }
            if moves >= 2 {
                break;
            }
        }

        arbiter.stop().await;
        // Clean up PGN
        let _ = std::fs::remove_file("test_tournament.pgn");
    }
}
