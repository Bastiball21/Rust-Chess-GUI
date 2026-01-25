import React, { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Board } from './components/Board';
import { Chess } from 'chess.js';
import SettingsModal from './components/SettingsModal';
import StatsPanel from './components/StatsPanel';
import BottomPanel from './components/BottomPanel';
import EvalMovePanel from './components/EvalMovePanel';
import { Settings, Play, Square } from 'lucide-react';

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

interface SprtSettings {
  enabled: boolean;
  h0Elo: number;
  h1Elo: number;
  drawRatio: number;
  alpha: number;
  beta: number;
}

interface TournamentSettings {
  mode: 'Match' | 'RoundRobin' | 'Gauntlet';
  gamesCount: number;
  swapSides: boolean;
  concurrency: number;
  timeControl: { baseMs: number; incMs: number };
  eventName: string;
  pgnPath: string;
  sprt: SprtSettings;
}

function App() {
  const [fen, setFen] = useState("start");
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [lastMove, setLastMove] = useState<string[]>([]);
  const [gameUpdate, setGameUpdate] = useState<GameUpdate | null>(null);
  const [whiteStats, setWhiteStats] = useState<EngineStats | null>(null);
  const [blackStats, setBlackStats] = useState<EngineStats | null>(null);
  const [moves, setMoves] = useState<string[]>([]);
  const [evalHistory, setEvalHistory] = useState<number[]>([]);
  const [tournamentSettings, setTournamentSettings] = useState<TournamentSettings>({
      mode: 'Match',
      gamesCount: 100,
      swapSides: true,
      concurrency: 1,
      timeControl: { baseMs: 60000, incMs: 1000 },
      eventName: '',
      pgnPath: 'tournament.pgn',
      sprt: {
          enabled: false,
          h0Elo: 0,
          h1Elo: 5,
          drawRatio: 0.5,
          alpha: 0.05,
          beta: 0.05,
      },
  });

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
  const chessRef = useRef(new Chess());
  const lastAppliedMoveRef = useRef<string | null>(null);
  const lastGameIdRef = useRef<number | null>(null);
  const gameUpdateRef = useRef<GameUpdate | null>(null);

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
        const payload = event.payload;
        setGameUpdate(event.payload);
        gameUpdateRef.current = payload;
        setFen(payload.fen);
        if (payload.game_id !== lastGameIdRef.current) {
            lastGameIdRef.current = payload.game_id;
            lastAppliedMoveRef.current = null;
            const initialFen = payload.last_move ? "start" : payload.fen;
            chessRef.current = new Chess(initialFen === "start" ? undefined : initialFen);
            setMoves([]);
            setEvalHistory([]);
        }
        if (payload.last_move) {
            // Parse uci move string to [from, to] for chessground
            const m = payload.last_move;
            setLastMove([m.substring(0,2), m.substring(2,4)]);
            if (lastAppliedMoveRef.current !== m) {
                const from = m.substring(0, 2);
                const to = m.substring(2, 4);
                const promotion = m.length > 4 ? m.substring(4) : undefined;
                const moveResult = chessRef.current.move({ from, to, promotion });
                if (moveResult?.san) {
                    setMoves(prev => [...prev, moveResult.san]);
                    lastAppliedMoveRef.current = m;
                } else {
                    chessRef.current = new Chess(payload.fen === "start" ? undefined : payload.fen);
                }
            }
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
        const activeGame = gameUpdateRef.current;
        if (activeGame && event.payload.game_id === activeGame.game_id) {
            const activeColor = activeGame.fen.split(' ')[1] === 'w' ? 'white' : 'black';
            const activeEngineIdx = activeColor === 'white' ? activeGame.white_engine_idx : activeGame.black_engine_idx;
            if (event.payload.engine_idx === activeEngineIdx) {
                const score = event.payload.score_mate !== null && event.payload.score_mate !== undefined
                    ? Math.sign(event.payload.score_mate) * 99
                    : (event.payload.score_cp || 0) / 100;
                setEvalHistory(prev => [...prev.slice(-99), score]);
            }
        }
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

  const formatScore = (cp?: number | null, mate?: number | null) => {
      if (mate !== undefined && mate !== null) return `M${mate}`;
      if (cp !== undefined && cp !== null) return (cp / 100).toFixed(2);
      return "0.00";
  };

  const activeColor = gameUpdate ? (gameUpdate.fen.split(' ')[1] === 'w' ? 'white' : 'black') : 'white';
  const activeStats = activeColor === 'white' ? whiteStats : blackStats;
  const pvShapes = useMemo(() => {
      if (!prefArrows) return [];
      const brushes = ['green', 'blue', 'yellow', 'red'];
      const pv = activeStats?.pv?.trim();
      const shapes: { orig: string; dest: string; brush: string }[] = [];
      if (pv) {
          const moves = pv.split(/\s+/).filter(Boolean);
          for (const move of moves) {
              if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) continue;
              const orig = move.slice(0, 2);
              const dest = move.slice(2, 4);
              const brush = brushes[shapes.length % brushes.length];
              shapes.push({ orig, dest, brush });
              if (shapes.length >= 4) break;
          }
      }
      if (shapes.length === 0 && lastMove.length === 2) {
          shapes.push({ orig: lastMove[0], dest: lastMove[1], brush: 'orange' });
      }
      return shapes;
  }, [activeStats?.pv, lastMove, prefArrows]);

  const startMatch = async () => {
      if (engines.length < 2) {
          alert("Please add at least 2 engines.");
          setIsSettingsOpen(true);
          return;
      }
      try {
          await invoke('start_match', {
              config: {
                  mode: tournamentSettings.mode,
                  engines,
                  time_control: { base_ms: tournamentSettings.timeControl.baseMs, inc_ms: tournamentSettings.timeControl.incMs },
                  games_count: tournamentSettings.gamesCount,
                  swap_sides: tournamentSettings.swapSides,
                  opening,
                  variant: 'standard',
                  concurrency: tournamentSettings.concurrency > 0 ? tournamentSettings.concurrency : undefined,
                  adjudication,
                  sprt_enabled: tournamentSettings.sprt.enabled,
                  sprt_config: tournamentSettings.sprt.enabled ? {
                      h0_elo: tournamentSettings.sprt.h0Elo,
                      h1_elo: tournamentSettings.sprt.h1Elo,
                      draw_ratio: tournamentSettings.sprt.drawRatio,
                      alpha: tournamentSettings.sprt.alpha,
                      beta: tournamentSettings.sprt.beta,
                  } : undefined,
                  disabled_engine_ids: [],
                  pgn_path: tournamentSettings.pgnPath,
                  event_name: tournamentSettings.eventName || undefined,
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
            tournamentSettings={tournamentSettings}
            onUpdateTournamentSettings={setTournamentSettings}
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
            <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Left: Board Area */}
                <div className="flex-1 flex flex-col items-center justify-center bg-gray-900/50 relative p-4 min-h-0">
                    <div className="w-full h-full shadow-2xl rounded-lg overflow-hidden border-4 border-gray-800 min-h-0">
                         <Board
                             fen={fen}
                             orientation={orientation}
                             lastMove={lastMove}
                             shapes={pvShapes}
                             config={{
                                 viewOnly: true,
                                 highlight: { lastMove: prefHighlight, check: true },
                                 drawable: { visible: prefArrows },
                             }}
                         />
                    </div>
                    {/* Engines Names near board */}
                    <div className="absolute top-4 left-4 text-white font-bold bg-black/50 px-3 py-1 rounded">
                        {gameUpdate && engines[gameUpdate.black_engine_idx]?.name}
                    </div>
                    <div className="absolute bottom-4 left-4 text-white font-bold bg-black/50 px-3 py-1 rounded">
                        {gameUpdate && engines[gameUpdate.white_engine_idx]?.name}
                    </div>
                </div>

                {/* Middle: Eval + Move Panel */}
                <div className="w-[320px] shrink-0 p-4 border-l border-gray-700 bg-gray-900/70 flex flex-col min-h-0">
                     <EvalMovePanel
                         evalHistory={evalHistory}
                         currentEval={formatScore(activeStats?.score_cp, activeStats?.score_mate)}
                         moves={moves}
                     />
                </div>

                {/* Right: Stats Panel */}
                <div className="w-[380px] shrink-0 p-4 border-l border-gray-700 bg-gray-800 flex flex-col min-h-0">
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
            <div className="h-[240px] shrink-0 bg-gray-800 border-t border-gray-700">
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
