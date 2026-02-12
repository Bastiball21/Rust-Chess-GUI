use tauri::{AppHandle, Manager, Emitter, State};
use tauri::window::{ProgressBarState, ProgressBarStatus};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::panic::AssertUnwindSafe;
use std::sync::{Arc, Mutex};
use futures::FutureExt;
use tokio::sync::mpsc;
use crate::arbiter::Arbiter;
use crate::types::{TournamentConfig, GameUpdate, EngineStats, ScheduledGame, TournamentError, TournamentResumeState, UciOption};
use crate::stats::TournamentStats;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

pub mod arbiter;
pub mod uci;
pub mod types;
pub mod stats;
pub mod sprt;
pub mod mock_engine;

struct AppState {
    current_arbiter: Arc<Mutex<Option<Arc<Arbiter>>>>,
    progress_tracker: Arc<Mutex<ProgressTracker>>,
}

#[derive(Default)]
struct ProgressTracker {
    schedule_states: HashMap<usize, String>,
}

impl ProgressTracker {
    fn reset(&mut self) {
        self.schedule_states.clear();
    }

    fn apply_update(&mut self, update: &ScheduledGame) -> (u32, u32) {
        if update.state == "Removed" {
            self.schedule_states.remove(&update.id);
        } else {
            self.schedule_states.insert(update.id, update.state.clone());
        }
        self.counts()
    }

    fn counts(&self) -> (u32, u32) {
        let mut total_games = 0;
        let mut remaining_games = 0;
        for state in self.schedule_states.values() {
            if state == "Removed" {
                continue;
            }
            total_games += 1;
            if !matches!(state.as_str(), "Finished" | "Aborted" | "Skipped") {
                remaining_games += 1;
            }
        }
        (total_games, remaining_games)
    }
}

fn update_taskbar_progress(app: &AppHandle, total_games: u32, remaining_games: u32) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if total_games == 0 {
        let _ = window.set_progress_bar(ProgressBarState {
            status: Some(ProgressBarStatus::None),
            progress: None,
        });
        return;
    }
    let completed = total_games.saturating_sub(remaining_games);
    let ratio = completed as f64 / total_games as f64;
    let progress = (ratio * 100.0).round().clamp(0.0, 100.0) as u64;
    let _ = window.set_progress_bar(ProgressBarState {
        status: Some(ProgressBarStatus::Normal),
        progress: Some(progress),
    });
}

fn handle_schedule_progress_update(
    app: &AppHandle,
    progress_tracker: &Arc<Mutex<ProgressTracker>>,
    update: &ScheduledGame,
) {
    let (total_games, remaining_games) = {
        let mut tracker = progress_tracker.lock().unwrap();
        tracker.apply_update(update)
    };
    update_taskbar_progress(app, total_games, remaining_games);
}

fn resume_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_dir.join("tournament_resume.json"))
}

#[tauri::command]
async fn start_match(app: AppHandle, state: State<'_, AppState>, mut config: TournamentConfig) -> Result<(), String> {
    let trimmed_path = config.pgn_path.as_deref().map(str::trim).filter(|path| !path.is_empty());
    config.pgn_path = Some(trimmed_path.unwrap_or("tournament.pgn").to_string());
    for engine in &config.engines {
        let engine_path = Path::new(&engine.path);
        if !engine_path.exists() {
            return Err("Cannot start: engine path missing or not executable".to_string());
        }
        #[cfg(unix)]
        {
            let metadata = std::fs::metadata(engine_path)
                .map_err(|_| "Cannot start: engine path missing or not executable".to_string())?;
            if metadata.permissions().mode() & 0o111 == 0 {
                return Err("Cannot start: engine path missing or not executable".to_string());
            }
        }
    }
    let maybe_arbiter = { let arbiter_lock = state.current_arbiter.lock().unwrap(); arbiter_lock.clone() };
    if let Some(arbiter) = maybe_arbiter { arbiter.stop().await; }
    {
        let mut tracker = state.progress_tracker.lock().unwrap();
        tracker.reset();
    }
    let (game_tx, mut game_rx) = mpsc::channel::<GameUpdate>(100);
    let (stats_tx, mut stats_rx) = mpsc::channel::<EngineStats>(100);
    let (tourney_stats_tx, mut tourney_stats_rx) = mpsc::channel::<TournamentStats>(100);
    let (schedule_update_tx, mut schedule_update_rx) = mpsc::channel::<ScheduledGame>(100);
    let (error_tx, mut error_rx) = mpsc::channel::<TournamentError>(100);

    let arbiter = Arbiter::new(config, game_tx, stats_tx, tourney_stats_tx, schedule_update_tx, error_tx).await.map_err(|e| e.to_string())?;
    let arbiter = Arc::new(arbiter);
    { let mut arbiter_lock = state.current_arbiter.lock().unwrap(); *arbiter_lock = Some(arbiter.clone()); }

    let app_handle = app.clone();
    tokio::spawn(async move { while let Some(update) = game_rx.recv().await { let _ = app_handle.emit("game-update", update); } });

    let app_handle_stats = app.clone();
    tokio::spawn(async move { while let Some(stats) = stats_rx.recv().await { let _ = app_handle_stats.emit("engine-stats", stats); } });

    let app_handle_tstats = app.clone();
    tokio::spawn(async move { while let Some(stats) = tourney_stats_rx.recv().await { let _ = app_handle_tstats.emit("tournament-stats", stats); } });

    let app_handle_schedule = app.clone();
    let progress_tracker = state.progress_tracker.clone();
    tokio::spawn(async move {
        while let Some(update) = schedule_update_rx.recv().await {
            handle_schedule_progress_update(&app_handle_schedule, &progress_tracker, &update);
            let _ = app_handle_schedule.emit("schedule-update", update);
        }
    });

    let app_handle_errors = app.clone();
    tokio::spawn(async move { while let Some(error) = error_rx.recv().await { let _ = app_handle_errors.emit("toast", error); } });

    let app_handle = app.clone();
    let arbiter_clone = arbiter.clone();
    tokio::spawn(async move {
        let result = AssertUnwindSafe(arbiter_clone.run_tournament()).catch_unwind().await;
        match result {
            Ok(Ok(())) => {}
            Ok(Err(e)) => println!("Tournament error: {}", e),
            Err(panic) => {
                let panic_message = if let Some(message) = panic.downcast_ref::<&str>() {
                    (*message).to_string()
                } else if let Some(message) = panic.downcast_ref::<String>() {
                    message.clone()
                } else {
                    "Unknown panic".to_string()
                };
                eprintln!("Tournament panic: {}", panic_message);
                let _ = app_handle.emit("critical-error", panic_message);
            }
        }
    });
    Ok(())
}

#[tauri::command]
async fn get_saved_tournament(app: AppHandle) -> Result<Option<TournamentResumeState>, String> {
    let path = resume_state_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let state: TournamentResumeState = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    Ok(Some(state))
}

#[tauri::command]
async fn discard_saved_tournament(app: AppHandle) -> Result<(), String> {
    let path = resume_state_path(&app)?;
    Arbiter::remove_resume_state_file(&path.to_string_lossy()).map_err(|e| e.to_string())
}

#[tauri::command]
async fn resume_match(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let path = resume_state_path(&app)?;
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut resume_state: TournamentResumeState = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    for game in &mut resume_state.schedule {
        if game.state == "Active" {
            game.state = "Pending".to_string();
            game.result = None;
        }
    }
    let mut config = resume_state.config.clone();
    config.resume_state_path = Some(path.to_string_lossy().to_string());
    config.resume_from_state = true;

    let maybe_arbiter = { let arbiter_lock = state.current_arbiter.lock().unwrap(); arbiter_lock.clone() };
    if let Some(arbiter) = maybe_arbiter { arbiter.stop().await; }
    {
        let mut tracker = state.progress_tracker.lock().unwrap();
        tracker.reset();
    }

    let (game_tx, mut game_rx) = mpsc::channel::<GameUpdate>(100);
    let (stats_tx, mut stats_rx) = mpsc::channel::<EngineStats>(100);
    let (tourney_stats_tx, mut tourney_stats_rx) = mpsc::channel::<TournamentStats>(100);
    let (schedule_update_tx, mut schedule_update_rx) = mpsc::channel::<ScheduledGame>(100);
    let (error_tx, mut error_rx) = mpsc::channel::<TournamentError>(100);

    let arbiter = Arbiter::new(config, game_tx, stats_tx, tourney_stats_tx, schedule_update_tx, error_tx).await.map_err(|e| e.to_string())?;
    arbiter.load_schedule_state(resume_state.schedule).await;
    let arbiter = Arc::new(arbiter);
    { let mut arbiter_lock = state.current_arbiter.lock().unwrap(); *arbiter_lock = Some(arbiter.clone()); }

    let app_handle = app.clone();
    tokio::spawn(async move { while let Some(update) = game_rx.recv().await { let _ = app_handle.emit("game-update", update); } });

    let app_handle_stats = app.clone();
    tokio::spawn(async move { while let Some(stats) = stats_rx.recv().await { let _ = app_handle_stats.emit("engine-stats", stats); } });

    let app_handle_tstats = app.clone();
    tokio::spawn(async move { while let Some(stats) = tourney_stats_rx.recv().await { let _ = app_handle_tstats.emit("tournament-stats", stats); } });

    let app_handle_schedule = app.clone();
    let progress_tracker = state.progress_tracker.clone();
    tokio::spawn(async move {
        while let Some(update) = schedule_update_rx.recv().await {
            handle_schedule_progress_update(&app_handle_schedule, &progress_tracker, &update);
            let _ = app_handle_schedule.emit("schedule-update", update);
        }
    });

    let app_handle_errors = app.clone();
    tokio::spawn(async move { while let Some(error) = error_rx.recv().await { let _ = app_handle_errors.emit("toast", error); } });

    let app_handle = app.clone();
    let arbiter_clone = arbiter.clone();
    tokio::spawn(async move {
        let result = AssertUnwindSafe(arbiter_clone.run_tournament()).catch_unwind().await;
        match result {
            Ok(Ok(())) => {}
            Ok(Err(e)) => println!("Tournament error: {}", e),
            Err(panic) => {
                let panic_message = if let Some(message) = panic.downcast_ref::<&str>() {
                    (*message).to_string()
                } else if let Some(message) = panic.downcast_ref::<String>() {
                    message.clone()
                } else {
                    "Unknown panic".to_string()
                };
                eprintln!("Tournament panic: {}", panic_message);
                let _ = app_handle.emit("critical-error", panic_message);
            }
        }
    });
    Ok(())
}

#[tauri::command]
async fn stop_match(state: State<'_, AppState>) -> Result<(), String> {
    let maybe_arbiter = { let mut arbiter_lock = state.current_arbiter.lock().unwrap(); let arb = arbiter_lock.clone(); *arbiter_lock = None; arb };
    if let Some(arbiter) = maybe_arbiter { arbiter.stop().await; }
    Ok(())
}

#[tauri::command]
async fn pause_match(state: State<'_, AppState>, paused: bool) -> Result<(), String> {
    let maybe_arbiter = { let arbiter_lock = state.current_arbiter.lock().unwrap(); arbiter_lock.clone() };
    if let Some(arbiter) = maybe_arbiter { arbiter.set_paused(paused).await; }
    Ok(())
}

#[tauri::command]
async fn update_remaining_rounds(state: State<'_, AppState>, remaining_rounds: u32) -> Result<(), String> {
    let maybe_arbiter = { let arbiter_lock = state.current_arbiter.lock().unwrap(); arbiter_lock.clone() };
    if let Some(arbiter) = maybe_arbiter {
        arbiter.update_remaining_rounds(remaining_rounds).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn set_disabled_engines(state: State<'_, AppState>, disabled_engine_ids: Vec<String>) -> Result<(), String> {
    let maybe_arbiter = { let arbiter_lock = state.current_arbiter.lock().unwrap(); arbiter_lock.clone() };
    if let Some(arbiter) = maybe_arbiter { arbiter.set_disabled_engine_ids(disabled_engine_ids).await; }
    Ok(())
}

#[tauri::command]
async fn export_tournament_pgn(source_path: String, destination_path: String) -> Result<(), String> {
    let source = Path::new(&source_path);
    if !source.exists() {
        return Err(format!("PGN file not found: {}", source_path));
    }
    if !source.is_file() {
        return Err(format!("PGN path is not a file: {}", source_path));
    }
    if let Some(parent) = Path::new(&destination_path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create destination directory {}: {}", parent.display(), e))?;
        }
    }
    std::fs::copy(&source_path, &destination_path)
        .map_err(|e| format!("Failed to write PGN to {}: {}", destination_path, e))?;
    Ok(())
}

#[tauri::command]
async fn query_engine_options(path: String) -> Result<Vec<UciOption>, String> {
    uci::query_engine_options(&path).await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState {
            current_arbiter: Arc::new(Mutex::new(None)),
            progress_tracker: Arc::new(Mutex::new(ProgressTracker::default())),
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                let state = window.state::<AppState>();
                let maybe_arbiter = {
                    let mut arbiter_lock = state.current_arbiter.lock().unwrap();
                    let arbiter = arbiter_lock.clone();
                    *arbiter_lock = None;
                    arbiter
                };
                if let Some(arbiter) = maybe_arbiter {
                    tauri::async_runtime::block_on(async move {
                        arbiter.stop().await;
                    });
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            start_match,
            stop_match,
            pause_match,
            update_remaining_rounds,
            set_disabled_engines,
            get_saved_tournament,
            discard_saved_tournament,
            resume_match,
            export_tournament_pgn,
            query_engine_options
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
