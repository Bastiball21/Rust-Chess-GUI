use mini_tcec_lib::types::*;
use mini_tcec_lib::arbiter::Arbiter;
use std::sync::Arc;
use tokio::sync::mpsc;

#[tokio::test]
async fn test_match_simulation() {
    // Path to mock-engine using Cargo's environment variable for integration tests
    let path_str = env!("CARGO_BIN_EXE_mock-engine").to_string();
    let pgn_path = "test_integration.pgn".to_string();

    let config = TournamentConfig {
        mode: TournamentMode::Match,
        engines: vec![
            EngineConfig {
                id: None,
                name: "MockWhite".into(),
                path: path_str.clone(),
                options: vec![],
                country_code: None,
                args: None,
                working_directory: None,
                protocol: None,
                logo_path: None,
            },
            EngineConfig {
                id: None,
                name: "MockBlack".into(),
                path: path_str.clone(),
                options: vec![],
                country_code: None,
                args: None,
                working_directory: None,
                protocol: None,
                logo_path: None,
            },
            EngineConfig {
                id: None,
                name: "MockWhite".into(),
                path: path_str.clone(),
                options: vec![],
                country_code: None,
                args: None,
                working_directory: None,
                protocol: None,
                logo_path: None,
            },
            EngineConfig {
                id: None,
                name: "MockBlack".into(),
                path: path_str,
                options: vec![],
                country_code: None,
                args: None,
                working_directory: None,
                protocol: None,
                logo_path: None,
            },
        ],
        time_control: TimeControl { base_ms: 1000, inc_ms: 100 },
        games_count: 2,
        swap_sides: true,
        opening: OpeningConfig {
            file: None,
            fen: None,
            depth: None,
            order: None,
            book_path: None,
        },
        variant: "standard".to_string(),
        concurrency: Some(1),
        pgn_path: Some(pgn_path.clone()),
        event_name: None,
        disabled_engine_ids: Vec::new(),
        resume_state_path: None,
        resume_from_state: false,
        adjudication: AdjudicationConfig {
            resign_score: None,
            resign_move_count: None,
            draw_score: None,
            draw_move_number: None,
            draw_move_count: None,
            result_adjudication: false,
        },
        sprt_enabled: false,
        sprt_config: None,
    };

    let (game_tx, mut game_rx) = mpsc::channel(100);
    // Keep receivers alive and drain them to prevent channel closure/blocking
    let (stats_tx, mut stats_rx) = mpsc::channel(100);
    let (tourney_stats_tx, mut tourney_stats_rx) = mpsc::channel(100);
    let (schedule_update_tx, mut schedule_update_rx) = mpsc::channel(100);
    let (error_tx, mut error_rx) = mpsc::channel(100);

    tokio::spawn(async move { while stats_rx.recv().await.is_some() {} });
    tokio::spawn(async move { while tourney_stats_rx.recv().await.is_some() {} });
    tokio::spawn(async move { while schedule_update_rx.recv().await.is_some() {} });
    tokio::spawn(async move { while error_rx.recv().await.is_some() {} });

    let arbiter = Arbiter::new(config, game_tx, stats_tx, tourney_stats_tx, schedule_update_tx, error_tx).await.expect("Failed to create arbiter");
    let arbiter = Arc::new(arbiter);

    // Run match in background
    let arbiter_clone = arbiter.clone();
    tokio::spawn(async move {
        if let Err(e) = arbiter_clone.run_tournament().await {
             println!("Match finished with error/end: {}", e);
        }
    });

    // Listen for updates
    let mut moves = 0;

    // We expect some moves and stats
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
            // We just want to see if it starts and makes moves.
            // 1 move is enough to verify plumbing.
            break;
        }
    }

    arbiter.stop().await;

    // Cleanup
    if std::path::Path::new(&pgn_path).exists() {
        let _ = std::fs::remove_file(pgn_path);
    }
}
