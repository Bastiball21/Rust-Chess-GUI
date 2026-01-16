use tauri::{AppHandle, Manager, Emitter, State};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use crate::arbiter::Arbiter;
use crate::types::{TournamentConfig, GameUpdate, EngineStats, ScheduledGame, TournamentResumeState};
use crate::stats::TournamentStats;

pub mod arbiter;
pub mod uci;
pub mod types;
pub mod stats;
pub mod mock_engine;
#[cfg(test)] mod test_integration;

struct AppState { current_arbiter: Arc<Mutex<Option<Arc<Arbiter>>>>, }

fn resume_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_dir.join("tournament_resume.json"))
}

#[tauri::command]
async fn start_match(app: AppHandle, state: State<'_, AppState>, mut config: TournamentConfig) -> Result<(), String> {
    let trimmed_path = config.pgn_path.as_deref().map(str::trim).filter(|path| !path.is_empty());
    config.pgn_path = Some(trimmed_path.unwrap_or("tournament.pgn").to_string());
    let maybe_arbiter = { let mut arbiter_lock = state.current_arbiter.lock().unwrap(); arbiter_lock.clone() };
    if let Some(arbiter) = maybe_arbiter { arbiter.stop().await; }
    let (game_tx, mut game_rx) = mpsc::channel::<GameUpdate>(100);
    let (stats_tx, mut stats_rx) = mpsc::channel::<EngineStats>(100);
    let (tourney_stats_tx, mut tourney_stats_rx) = mpsc::channel::<TournamentStats>(100);
    let (schedule_update_tx, mut schedule_update_rx) = mpsc::channel::<ScheduledGame>(100);

    let arbiter = Arbiter::new(config, game_tx, stats_tx, tourney_stats_tx, schedule_update_tx).await.map_err(|e| e.to_string())?;
    let arbiter = Arc::new(arbiter);
    { let mut arbiter_lock = state.current_arbiter.lock().unwrap(); *arbiter_lock = Some(arbiter.clone()); }

    let app_handle = app.clone();
    tokio::spawn(async move { while let Some(update) = game_rx.recv().await { let _ = app_handle.emit("game-update", update); } });

    let app_handle_stats = app.clone();
    tokio::spawn(async move { while let Some(stats) = stats_rx.recv().await { let _ = app_handle_stats.emit("engine-stats", stats); } });

    let app_handle_tstats = app.clone();
    tokio::spawn(async move { while let Some(stats) = tourney_stats_rx.recv().await { let _ = app_handle_tstats.emit("tournament-stats", stats); } });

    let app_handle_schedule = app.clone();
    tokio::spawn(async move { while let Some(update) = schedule_update_rx.recv().await { let _ = app_handle_schedule.emit("schedule-update", update); } });

    let arbiter_clone = arbiter.clone();
    tokio::spawn(async move { if let Err(e) = arbiter_clone.run_tournament().await { println!("Tournament error: {}", e); } });
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

    let maybe_arbiter = { let mut arbiter_lock = state.current_arbiter.lock().unwrap(); arbiter_lock.clone() };
    if let Some(arbiter) = maybe_arbiter { arbiter.stop().await; }

    let (game_tx, mut game_rx) = mpsc::channel::<GameUpdate>(100);
    let (stats_tx, mut stats_rx) = mpsc::channel::<EngineStats>(100);
    let (tourney_stats_tx, mut tourney_stats_rx) = mpsc::channel::<TournamentStats>(100);
    let (schedule_update_tx, mut schedule_update_rx) = mpsc::channel::<ScheduledGame>(100);

    let arbiter = Arbiter::new(config, game_tx, stats_tx, tourney_stats_tx, schedule_update_tx).await.map_err(|e| e.to_string())?;
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
    tokio::spawn(async move { while let Some(update) = schedule_update_rx.recv().await { let _ = app_handle_schedule.emit("schedule-update", update); } });

    let arbiter_clone = arbiter.clone();
    tokio::spawn(async move { if let Err(e) = arbiter_clone.run_tournament().await { println!("Tournament error: {}", e); } });
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState { current_arbiter: Arc::new(Mutex::new(None)), })
        .invoke_handler(tauri::generate_handler![start_match, get_saved_tournament, discard_saved_tournament, resume_match, stop_match, pause_match])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
