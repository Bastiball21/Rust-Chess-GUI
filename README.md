# CCRL GUI

CCRL GUI (Computer Chess Rating List GUI) is a lightweight tournament manager for chess engines, built with Tauri (Rust) and React (TypeScript). It allows you to run matches and tournaments between UCI-compatible chess engines with a modern, dark-mode UI.

This release marks the debut of the CCRL GUI, which is intended to become the default GUI for CCRL testing in the future.

## Features

- **Tournament Modes:**
  - **Match:** 1v1 match between two engines.
  - **Round Robin:** All engines play against each other.
  - **Gauntlet:** One engine plays against a pool of challengers.
- **Engine Management:**
  - **Engine Inventory:** Add, configure, and organize engines.
  - **UCI Option Detection:** Automatically detect engine options (Hash, Threads, SyzygyPath, etc.) and configure them via a user-friendly UI.
  - **Engine Logos:** Support for custom engine logos.
- **Advanced Configuration:**
  - **Adjudication:** Configure Resign and Draw rules (Score thresholds, Move counts, Move numbers).
  - **Opening Suite:** Support for PGN/EPD files, FEN strings, Book Depth, and Sequential/Random ordering.
  - **General Settings:** Toggle "Highlight Legal Moves" and "Show Move Arrows".
- **Real-time Monitoring:**
  - **Live Board:** Watch games in real-time with `react-chessground`.
  - **Stats Panel:** Detailed engine analysis (Depth, NPS, Nodes, Hash usage, TB Hits) and Principal Variation (PV) visualization.
  - **Live Standings:** Real-time table showing Rank, Points, Score %, Wins/Losses/Draws, SB, and Elo.
- **PGN Export:**
  - Games are auto-saved to `tournament.pgn`.
  - **Copy Live PGN:** Click the "COPY PGN" button above the move list to copy the current game's PGN to clipboard.

## Usage

### 1. Setup Engines
- Click the **Settings** (gear icon) in the top toolbar.
- Go to the **Engines** tab.
- Click **Add Engine** to select an executable. You can use the `...` **Browse** button to quickly find cross-platform executables on your file system without extension restrictions.
- Click the **Settings** (gear) button next to an engine's delete icon to explicitly add, edit, or remove custom key-value UCI options for that specific engine.
- Use the **Checkbox** on the left of each engine to quickly enable or disable it from participating in the upcoming tournament without having to delete the engine configuration.

### 2. Configure Tournament
- In **Settings > Games**, configure Adjudication rules and Opening Suites.
- In the main view, click **Start Match**. Only engines with their checkbox enabled in the Settings modal will participate in the match.

### 3. Run
- The app displays the **Live Board** on the left and **Stats Panel** on the right.
- Use the tabs at the bottom to view **Standings**, **Schedule**, and **Crash Info**.

## Development

### Prerequisites
- Rust (latest stable)
- Node.js & npm
- Linux dependencies: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`

### Build & Run
```bash
npm install
npm run tauri dev
```
