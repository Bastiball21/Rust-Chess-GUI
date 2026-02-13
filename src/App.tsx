import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Board } from './components/Board';
import { Chess } from 'chess.js';
import SettingsModal from './components/SettingsModal';
import StatsPanel from './components/StatsPanel';
import BottomPanel from './components/BottomPanel';
import EvalMovePanel from './components/EvalMovePanel';
import { Pause, Play, Settings, Square } from 'lucide-react';
import {
  GameUpdate,
  EngineStats,
  ScheduledGame,
  StandingsEntry,
  EngineConfig,
  TournamentSettings,
  AdjudicationConfig,
  OpeningConfig
} from './types';

function App() {
  const [fen, setFen] = useState("start");
  const [orientation] = useState<'white' | 'black'>('white');
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
      overwritePgn: false,
      variant: 'standard',
      disabledEngineIds: [],
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
  const [adjudication, setAdjudication] = useState<AdjudicationConfig>({
      resign_score: 600,
      resign_move_count: 5,
      draw_score: 5,
      draw_move_number: 40,
      draw_move_count: 20,
      result_adjudication: true,
      syzygy_path: null,
  });
  const [opening, setOpening] = useState<OpeningConfig>({
      file: null,
      fen: null,
      depth: 0,
      order: "sequential",
      book_path: null,
  });

  // Tournament State
  const [schedule, setSchedule] = useState<ScheduledGame[]>([]);
  const [standings, setStandings] = useState<StandingsEntry[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [activeBottomTab, setActiveBottomTab] = useState('standings');
  const [matchActive, setMatchActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'engines' | 'tournaments'>('engines');

  // Preferences
  const [prefHighlight, setPrefHighlight] = useState(localStorage.getItem('pref_highlight_legal') === 'true');
  const [prefArrows, setPrefArrows] = useState(localStorage.getItem('pref_show_arrows') !== 'false');
  const chessRef = useRef(new Chess());
  const lastAppliedMoveRef = useRef<string | null>(null);
  const lastGameIdRef = useRef<number | null>(null);
  const gameUpdateRef = useRef<GameUpdate | null>(null);
  const lastStatsUpdateRef = useRef<number>(0);

  const normalizeEngines = (nextEngines: EngineConfig[]) => (
      nextEngines.map(engine => (engine.id ? engine : { ...engine, id: crypto.randomUUID() }))
  );

  useEffect(() => {
      if (engines.some(engine => !engine.id)) {
          setEngines(prev => normalizeEngines(prev));
      }
  }, [engines]);

  useEffect(() => {
      setTournamentSettings(prev => {
          if (engines.length === 0 && prev.disabledEngineIds.length === 0) return prev;
          const validIds = new Set(engines.map(engine => engine.id).filter((id): id is string => Boolean(id)));
          const nextDisabled = prev.disabledEngineIds.filter(id => validIds.has(id));
          if (nextDisabled.length === prev.disabledEngineIds.length) return prev;
          return { ...prev, disabledEngineIds: nextDisabled };
      });
  }, [engines]);

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
                try {
                    const moveResult = chessRef.current.move({ from, to, promotion });
                    if (moveResult?.san) {
                        setMoves(prev => [...prev, moveResult.san]);
                        lastAppliedMoveRef.current = m;
                    } else {
                        chessRef.current = new Chess(payload.fen === "start" ? undefined : payload.fen);
                    }
                } catch (error) {
                    console.warn("Frontend chess.js validation failed:", error);
                    chessRef.current = new Chess(payload.fen === "start" ? undefined : payload.fen);
                }
            }
        }
    });

    const unlistenStats = listen<EngineStats>('engine-stats', (event) => {
        const now = Date.now();
        if (now - lastStatsUpdateRef.current > 100) {
            lastStatsUpdateRef.current = now;

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
      const enabledEngines = engines.filter(engine => !tournamentSettings.disabledEngineIds.includes(engine.id ?? ''));
      if (enabledEngines.length < 2) {
          alert("Please add at least 2 engines.");
          setIsSettingsOpen(true);
          return;
      }
      try {
          await invoke('start_match', {
              config: {
                  mode: tournamentSettings.mode,
                  engines: enabledEngines,
                  time_control: { base_ms: tournamentSettings.timeControl.baseMs, inc_ms: tournamentSettings.timeControl.incMs },
                  games_count: tournamentSettings.gamesCount,
                  swap_sides: tournamentSettings.swapSides,
                  opening,
                  variant: tournamentSettings.variant,
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
                  overwrite_pgn: tournamentSettings.overwritePgn,
                  event_name: tournamentSettings.eventName || undefined,
              }
          });
          setMatchActive(true);
          setIsPaused(false);
      } catch (e) {
          console.error(e);
          alert("Failed to start match: " + e);
      }
  };

  const stopMatch = async () => {
      await invoke('stop_match');
      setMatchActive(false);
      setIsPaused(false);
  };

  const togglePause = async () => {
      const nextPaused = !isPaused;
      try {
          await invoke('pause_match', { paused: nextPaused });
          setIsPaused(nextPaused);
      } catch (e) {
          console.error(e);
          alert("Failed to toggle pause: " + e);
      }
  };

  // -- Helper calculations --
  const getEngineName = (idx: number | undefined) => {
      if (idx === undefined || !engines[idx]) return undefined;
      return engines[idx].name;
  };

  const getEngineLogo = (idx: number | undefined) => {
      if (idx === undefined || !engines[idx]) return undefined;
      // Convert backend file path to asset URL if needed, or pass as is
      // (Tauri usually requires specific handling for local files, but for now assuming direct path or url)
      return engines[idx].logo_path;
  };

  const whiteName = gameUpdate ? getEngineName(gameUpdate.white_engine_idx) : "White";
  const blackName = gameUpdate ? getEngineName(gameUpdate.black_engine_idx) : "Black";
  const whiteLogo = gameUpdate ? getEngineLogo(gameUpdate.white_engine_idx) : undefined;
  const blackLogo = gameUpdate ? getEngineLogo(gameUpdate.black_engine_idx) : undefined;

  // --- LOGIC FOR CLOCK TICKING ---
  // Determine who is active based on FEN, but ONLY if game is running and not paused.
  const rawActiveColor = gameUpdate ? (gameUpdate.fen.split(' ')[1] === 'w' ? 'white' : 'black') : undefined;

  // The clock should tick ONLY if:
  // 1. The match is active
  // 2. We are NOT paused
  // 3. The game has NOT ended (result is null)
  const isGameRunning = matchActive && !isPaused && (!gameUpdate || gameUpdate.result === null);

  const effectiveActiveColor = isGameRunning ? rawActiveColor : undefined;

  return (
    <div className="flex h-screen w-screen bg-gray-900 text-white overflow-hidden font-sans">
        {/* Settings Modal */}
        <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            initialTab={settingsTab}
            onStartMatch={startMatch}
            engines={engines} onUpdateEngines={(nextEngines) => setEngines(normalizeEngines(nextEngines))}
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
                    {matchActive && (
                        <>
                            <button
                                onClick={togglePause}
                                className="bg-amber-500 hover:bg-amber-400 px-4 py-1.5 rounded flex items-center gap-2 font-bold text-sm text-gray-900"
                            >
                                {isPaused ? <Play size={16}/> : <Pause size={16}/>}
                                {isPaused ? 'Resume' : 'Pause'}
                            </button>
                            <button
                                onClick={stopMatch}
                                className="bg-red-600 hover:bg-red-500 px-4 py-1.5 rounded flex items-center gap-2 font-bold text-sm"
                            >
                                <Square size={16}/> Stop
                            </button>
                        </>
                    )}
                    <button
                        onClick={() => {
                            setSettingsTab('engines');
                            setIsSettingsOpen(true);
                        }}
                        className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded text-gray-300"
                    >
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
                             whiteName={whiteName}
                             blackName={blackName}
                             whiteLogo={whiteLogo}
                             blackLogo={blackLogo}
                         />
                    </div>
                </div>

                {/* Middle: Eval + Move Panel */}
                <div className="w-[320px] shrink-0 p-4 border-l border-gray-700 bg-gray-900/70 flex flex-col min-h-0">
                     <EvalMovePanel
                         evalHistory={evalHistory}
                         currentEval={formatScore(activeStats?.score_cp, activeStats?.score_mate)}
                         moves={moves}
                         // Pass the strictly calculated active color
                         whiteTime={gameUpdate?.white_time ?? tournamentSettings.timeControl.baseMs}
                         blackTime={gameUpdate?.black_time ?? tournamentSettings.timeControl.baseMs}
                         activeColor={effectiveActiveColor}
                     />
                </div>

                {/* Right: Stats Panel */}
                <div className="w-[380px] shrink-0 p-2 border-l border-gray-700 bg-gray-800 flex flex-col min-h-0">
                     <StatsPanel
                         gameUpdate={gameUpdate}
                         whiteStats={whiteStats}
                         blackStats={blackStats}
                         whiteName={whiteName || "White"}
                         blackName={blackName || "Black"}
                         whiteLogo={whiteLogo}
                         blackLogo={blackLogo}
                         currentFen={fen}
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
