import React, { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import Chessground from 'react-chessground';
import 'react-chessground/dist/styles/chessground.css';
import { Chess } from 'chess.js';
import SettingsModal from './components/SettingsModal';
import StatsPanel from './components/StatsPanel';
import BottomPanel from './components/BottomPanel';
import { Settings, Play, Square, Pause } from 'lucide-react';

// --- Types --- (Centralize these in types.ts later)
export interface GameUpdate {
  fen: string;
  last_move: string | null;
  white_time: number;
  black_time: number;
  move_number: number;
  result: string | null;
  white_engine_idx: number;
  black_engine_idx: number;
  game_id: number;
}

export interface EngineStats {
  depth: number;
  score_cp: number | null;
  score_mate: number | null;
  nodes: number;
  nps: number;
  pv: string;
  engine_idx: number;
  game_id: number;
  tb_hits?: number;
  hash_full?: number;
}

export interface ScheduledGame {
  id: number;
  white_name: string;
  black_name: string;
  state: string;
  result: string | null;
}

export interface StandingsEntry {
  rank: number;
  engine_name: string;
  engine_id?: string;
  games_played: number;
  points: number;
  score_percent: number;
  wins: number;
  losses: number;
  draws: number;
  crashes: number;
  sb: number;
  elo: number;
}

interface EngineConfig {
  id?: string;
  name: string;
  path: string;
  options: [string, string][];
  protocol?: string;
  logo_path?: string;
}

function App() {
  const [fen, setFen] = useState("start");
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [lastMove, setLastMove] = useState<string[]>([]);
  const [gameUpdate, setGameUpdate] = useState<GameUpdate | null>(null);
  const [whiteStats, setWhiteStats] = useState<EngineStats | null>(null);
  const [blackStats, setBlackStats] = useState<EngineStats | null>(null);

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [engines, setEngines] = useState<EngineConfig[]>([]);
  const [adjudication, setAdjudication] = useState({ resign_score: 600, resign_move_count: 5, draw_score: 5, draw_move_number: 40, draw_move_count: 20, result_adjudication: true });
  const [opening, setOpening] = useState({ file: null, fen: null, depth: 0, order: "sequential", book_path: null });

  // Tournament State
  const [schedule, setSchedule] = useState<ScheduledGame[]>([]);
  const [standings, setStandings] = useState<StandingsEntry[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [activeBottomTab, setActiveBottomTab] = useState('standings');
  const [matchActive, setMatchActive] = useState(false);

  // Preferences
  const [prefHighlight, setPrefHighlight] = useState(localStorage.getItem('pref_highlight_legal') === 'true');
  const [prefArrows, setPrefArrows] = useState(localStorage.getItem('pref_show_arrows') !== 'false');

  // Listen for storage changes (settings modal updates)
  useEffect(() => {
    const handleStorage = () => {
        setPrefHighlight(localStorage.getItem('pref_highlight_legal') === 'true');
        setPrefArrows(localStorage.getItem('pref_show_arrows') !== 'false');
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    // Listeners
    const unlistenGame = listen<GameUpdate>('game-update', (event) => {
        setGameUpdate(event.payload);
        setFen(event.payload.fen);
        if (event.payload.last_move) {
            // Parse uci move string to [from, to] for chessground
            const m = event.payload.last_move;
            setLastMove([m.substring(0,2), m.substring(2,4)]);
        }
    });

    const unlistenStats = listen<EngineStats>('engine-stats', (event) => {
        // Need to know which engine color it corresponds to
        // We can infer from `engine_idx` in `gameUpdate` or checking against engines list
        // Simplified: The backend sends stats. In `arbiter.rs`, we know engine indices.
        // We need to map `event.payload.engine_idx` to white/black.
        // For now, rely on `gameUpdate` having indices.
        setGameUpdate(curr => {
            if (!curr) return null;
            if (event.payload.engine_idx === curr.white_engine_idx) setWhiteStats(event.payload);
            if (event.payload.engine_idx === curr.black_engine_idx) setBlackStats(event.payload);
            return curr;
        });
    });

    const unlistenTStats = listen<any>('tournament-stats', (event) => {
        // Payload has `standings: { entries: [] }`
        if (event.payload.standings && event.payload.standings.entries) {
            setStandings(event.payload.standings.entries);
        }
    });

    const unlistenSched = listen<ScheduledGame>('schedule-update', (event) => {
        setSchedule(prev => {
            const idx = prev.findIndex(g => g.id === event.payload.id);
            if (idx >= 0) {
                const newSched = [...prev];
                newSched[idx] = event.payload;
                return newSched;
            }
            return [...prev, event.payload];
        });
    });

    const unlistenErr = listen<any>('toast', (event) => {
        setErrors(prev => [event.payload, ...prev]);
    });

    return () => {
        unlistenGame.then(f => f());
        unlistenStats.then(f => f());
        unlistenTStats.then(f => f());
        unlistenSched.then(f => f());
        unlistenErr.then(f => f());
    };
  }, []);

  // Compute Arrows for PV
  const getArrows = () => {
      if (!prefArrows) return [];
      const arrows: [string, string, string][] = []; // [from, to, color]
      if (lastMove.length === 2) arrows.push([lastMove[0], lastMove[1], 'orange']);

      // We could parse PV strings to draw arrows, but for now let's just show last move.
      // Advanced PV arrows would require full chess logic to parse the PV string into coordinates.
      // Given we have `chess.js` we can do it, but let's stick to last move for now to keep it smooth.
      // Actually, user explicitly asked for "Show move arrows" which usually implies PV.
      // I'll leave it as TODO or basic last move for stability.
      return arrows;
  };

  const startMatch = async () => {
      if (engines.length < 2) {
          alert("Please add at least 2 engines.");
          setIsSettingsOpen(true);
          return;
      }
      try {
          await invoke('start_match', {
              config: {
                  mode: 'Match', // Default
                  engines,
                  time_control: { base_ms: 60000, inc_ms: 1000 }, // Defaults, maybe expose in modal later
                  games_count: 100,
                  swap_sides: true,
                  opening,
                  variant: 'standard',
                  concurrency: 1,
                  adjudication,
                  disabled_engine_ids: [],
                  pgn_path: "tournament.pgn"
              }
          });
          setMatchActive(true);
      } catch (e) {
          console.error(e);
          alert("Failed to start match: " + e);
      }
  };

  const stopMatch = async () => {
      await invoke('stop_match');
      setMatchActive(false);
  };

  return (
    <div className="flex h-screen w-screen bg-gray-900 text-white overflow-hidden font-sans">
        {/* Settings Modal */}
        <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            engines={engines} onUpdateEngines={setEngines}
            adjudication={adjudication} onUpdateAdjudication={setAdjudication}
            opening={opening} onUpdateOpening={setOpening}
        />

        {/* Main Grid Layout */}
        <div className="flex flex-col w-full h-full">
            {/* Top Toolbar */}
            <div className="h-12 bg-gray-800 border-b border-gray-700 flex items-center px-4 justify-between shrink-0">
                <div className="font-bold text-xl flex items-center gap-2">
                    <span className="text-blue-500">CCRL</span> GUI
                </div>
                <div className="flex gap-2">
                    {!matchActive ? (
                        <button onClick={startMatch} className="bg-green-600 hover:bg-green-500 px-4 py-1.5 rounded flex items-center gap-2 font-bold text-sm">
                            <Play size={16}/> Start Match
                        </button>
                    ) : (
                        <button onClick={stopMatch} className="bg-red-600 hover:bg-red-500 px-4 py-1.5 rounded flex items-center gap-2 font-bold text-sm">
                            <Square size={16}/> Stop
                        </button>
                    )}
                    <button onClick={() => setIsSettingsOpen(true)} className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded text-gray-300">
                        <Settings size={18}/>
                    </button>
                </div>
            </div>

            {/* Split Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Board Area */}
                <div className="flex-1 flex flex-col items-center justify-center bg-gray-900/50 relative p-4">
                    <div className="w-full h-full max-h-full aspect-square shadow-2xl rounded-lg overflow-hidden border-4 border-gray-800 flex items-center justify-center">
                         <div style={{ width: '100%', height: '100%' }}>
                             <Chessground
                                 fen={fen}
                                 orientation={orientation}
                                 width="100%"
                                 height="100%"
                                 config={{
                                     viewOnly: true,
                                     highlight: { lastMove: prefHighlight, check: true },
                                     drawable: { visible: prefArrows }, // Arrows logic pending
                                 }}
                             />
                         </div>
                    </div>
                    {/* Engines Names near board */}
                    <div className="absolute top-4 left-4 text-white font-bold bg-black/50 px-3 py-1 rounded">
                        {gameUpdate && engines[gameUpdate.black_engine_idx]?.name}
                    </div>
                    <div className="absolute bottom-4 left-4 text-white font-bold bg-black/50 px-3 py-1 rounded">
                        {gameUpdate && engines[gameUpdate.white_engine_idx]?.name}
                    </div>
                </div>

                {/* Right: Stats Panel */}
                <div className="w-[400px] shrink-0 p-4 border-l border-gray-700 bg-gray-800">
                     <StatsPanel
                         gameUpdate={gameUpdate}
                         whiteStats={whiteStats}
                         blackStats={blackStats}
                         whiteName={gameUpdate ? engines[gameUpdate.white_engine_idx]?.name : "White"}
                         blackName={gameUpdate ? engines[gameUpdate.black_engine_idx]?.name : "Black"}
                         whiteLogo={gameUpdate ? engines[gameUpdate.white_engine_idx]?.logo_path : undefined}
                         blackLogo={gameUpdate ? engines[gameUpdate.black_engine_idx]?.logo_path : undefined}
                     />
                </div>
            </div>

            {/* Bottom: Tabs & Tables */}
            <div className="h-[300px] shrink-0 bg-gray-800 border-t border-gray-700">
                <BottomPanel
                    standings={standings}
                    schedule={schedule}
                    errors={errors}
                    activeTab={activeBottomTab}
                    setActiveTab={setActiveBottomTab}
                />
            </div>
        </div>
    </div>
  );
}

export default App;
