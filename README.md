# Mini-TCEC

Mini-TCEC is a lightweight tournament manager for chess engines, built with Tauri (Rust) and React (TypeScript). It allows you to run matches and tournaments between UCI-compatible chess engines with a modern, dark-mode UI.

## Features

- **Tournament Modes:**
  - **Match:** 1v1 match between two engines.
  - **Round Robin:** All engines play against each other.
  - **Gauntlet:** One engine plays against a pool of challengers.
- **Engine Management:**
  - Add/Remove UCI engines.
  - **Rename Engines:** Click on the engine name in the settings to rename it (e.g., "Stockfish 16").
  - Configure engine options (via code/config).
- **Time Controls:** Configurable Base time and Increment (H:M:S).
- **Concurrency:** Run multiple games in parallel (up to 16 threads).
- **Openings:** Support for FEN strings or opening files (.epd, .pgn).
- **Real-time Monitoring:**
  - **Live Board:** Watch games in real-time.
  - **Multi-Game View:** Click on any "Active" game in the **Schedule** tab to switch the main board view to that game.
  - **Evaluation Graph:** Live score tracking.
  - **Engine Stats:** Depth, NPS, Nodes, PV.
- **PGN Export:**
  - Games are auto-saved to `tournament.pgn`.
  - **Copy Live PGN:** Click the "COPY PGN" button above the move list to copy the current game's PGN to clipboard.

## Usage

### 1. Setup Engines
- Go to the **SETTINGS** tab.
- Click `+ ADD` to add a new engine.
- Click `...` to select the engine executable.
- Click the engine name (e.g., "Engine 1") to rename it to something recognizable.

### 2. Configure Tournament
- Select **Tournament Mode** (Match, Round Robin, etc.).
- Set **Time Control** (e.g., 0:1:0 for 1 minute + 0s increment).
- Choose **Opening** (optional): Paste a FEN or select a file.
- Set **Concurrency**: Number of games to run simultaneously.

### 3. Run
- Click **START TOURNAMENT**.
- The app will automatically switch to the **SCHEDULE** tab.
- Click on any game in the list to view it on the main board.
- Click **PAUSE** to temporarily suspend execution.
- Click **STOP** to end the tournament.

## Development

### Prerequisites
- Rust (latest stable)
- Node.js & npm

### Build & Run
```bash
npm install
npm run tauri dev
```
