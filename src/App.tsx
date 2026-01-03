import React, { useState, useEffect } from "react";
import { Board } from "./components/Board";
import { EnginePanel } from "./components/EnginePanel";
import { EvalGraph } from "./components/EvalGraph";
import { MoveList } from "./components/MoveList";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import { open } from "@tauri-apps/plugin-dialog";

interface GameUpdate {
  fen: string;
  last_move: string | null;
  white_time: number;
  black_time: number;
  move_number: number;
  result: string | null;
  white_engine_idx: number;
  black_engine_idx: number;
}

interface EngineStats {
  engine_idx: number;
  depth: number;
  score_cp: number;
  nodes: number;
  nps: number;
  pv: string;
}

interface EngineConfig {
  name: string;
  path: string;
  options: [string, string][];
}

interface ScheduledGame {
  id: number;
  white_name: string;
  black_name: string;
  state: string;
  result: string | null;
}

function App() {
  const [fen, setFen] = useState("start");
  const [lastMove, setLastMove] = useState<string[]>([]);
  const [moves, setMoves] = useState<string[]>([]);
  // We keep stats for the currently active white/black engines for display
  const [activeWhiteStats, setActiveWhiteStats] = useState({ name: "White", score: 0 });
  const [activeBlackStats, setActiveBlackStats] = useState({ name: "Black", score: 0 });
  const [tournamentStats, setTournamentStats] = useState<any>(null);
  const [whiteEngineIdx, setWhiteEngineIdx] = useState(0);
  const [blackEngineIdx, setBlackEngineIdx] = useState(1);

  const [evalHistory, setEvalHistory] = useState<any[]>([]);
  const [matchResult, setMatchResult] = useState<string | null>(null);

  // Tournament Settings
  const [tournamentMode, setTournamentMode] = useState<"Match" | "RoundRobin" | "Gauntlet">("Match");
  const [engines, setEngines] = useState<EngineConfig[]>([
      { name: "Engine 1", path: "mock-engine", options: [] },
      { name: "Engine 2", path: "mock-engine", options: [] }
  ]);

  const [gamesCount, setGamesCount] = useState(10);
  const [swapSides, setSwapSides] = useState(true);
  const [openingFen, setOpeningFen] = useState("");
  const [openingFile, setOpeningFile] = useState("");
  const [openingMode, setOpeningMode] = useState<'fen' | 'file'>('fen');
  const [variant, setVariant] = useState("standard");

  // Time Control State (H, M, S)
  const [baseH, setBaseH] = useState(0);
  const [baseM, setBaseM] = useState(1);
  const [baseS, setBaseS] = useState(0);

  const [incH, setIncH] = useState(0);
  const [incM, setIncM] = useState(0);
  const [incS, setIncS] = useState(1);

  const [isPaused, setIsPaused] = useState(false);
  const [matchRunning, setMatchRunning] = useState(false);
  const [store, setStore] = useState<any>(null);

  // New State for Schedule Tab
  const [activeTab, setActiveTab] = useState<'settings' | 'schedule'>('settings');
  const [schedule, setSchedule] = useState<ScheduledGame[]>([]);

  useEffect(() => {
    const initStore = async () => {
      const s = await load('settings.json');
      setStore(s);
      // Load saved engines if any
      const savedEngines = await s.get("engines");
      if (savedEngines) {
         setEngines(savedEngines as EngineConfig[]);
      }
    };
    initStore();
  }, []);

  useEffect(() => {
    if (!store) return;
    store.set("engines", engines).then(() => store.save());
  }, [engines, store]);

  useEffect(() => {
    const unlistenUpdate = listen("game-update", (event: any) => {
      const u = event.payload as GameUpdate;
      setFen(u.fen);
      if (u.last_move) {
        const from = u.last_move.substring(0, 2);
        const to = u.last_move.substring(2, 4);
        setLastMove([from, to]);
        setMoves(prev => [...prev, u.last_move!]);
      }
      setWhiteEngineIdx(u.white_engine_idx);
      setBlackEngineIdx(u.black_engine_idx);

      // Update names
      const whiteName = engines[u.white_engine_idx]?.name || `Engine ${u.white_engine_idx}`;
      const blackName = engines[u.black_engine_idx]?.name || `Engine ${u.black_engine_idx}`;

      setActiveWhiteStats((s: any) => ({ ...s, name: whiteName, time: u.white_time }));
      setActiveBlackStats((s: any) => ({ ...s, name: blackName, time: u.black_time }));

      if (u.result) setMatchResult(`Game Over: ${u.result}`);
    });

    const unlistenTourneyStats = listen("tournament-stats", (event: any) => {
        setTournamentStats(event.payload);
    });

    const unlistenSchedule = listen("schedule-update", (event: any) => {
        const update = event.payload as ScheduledGame;
        setSchedule(prev => {
            const index = prev.findIndex(g => g.id === update.id);
            if (index !== -1) {
                const newSchedule = [...prev];
                newSchedule[index] = update;
                return newSchedule;
            } else {
                return [...prev, update];
            }
        });
    });

    const unlistenStats = listen("engine-stats", (event: any) => {
      const s = event.payload;
      const update = { depth: s.depth, score: s.score_cp, nodes: s.nodes, nps: s.nps, pv: s.pv };

      // Update stats based on which engine sent it
      setWhiteEngineIdx(currWhite => {
          if (currWhite === s.engine_idx) {
             setActiveWhiteStats(prev => ({...prev, ...update}));
          }
          return currWhite;
      });
      setBlackEngineIdx(currBlack => {
          if (currBlack === s.engine_idx) {
             setActiveBlackStats(prev => ({...prev, ...update}));
          }
          return currBlack;
      });
    });
    return () => {
        unlistenUpdate.then(f => f());
        unlistenStats.then(f => f());
        unlistenTourneyStats.then(f => f());
        unlistenSchedule.then(f => f());
    };
  }, [engines]); // Re-bind if engines list changes (though usually locked during match)

  useEffect(() => {
    if (moves.length > 0) {
      let score = 0;
      // For history, we just want White's advantage.
      score = activeWhiteStats.score;
      setEvalHistory(prev => [...prev, { moveNumber: moves.length, score: score || 0 }]);
    } else {
      setEvalHistory([]);
    }
  }, [moves, activeWhiteStats.score]);

  const startMatch = async () => {
    setMoves([]); setMatchResult(null); setMatchRunning(true); setIsPaused(false);
    setSchedule([]); // Clear schedule on start

    // Initialize display names immediately based on the first game pairing
    if (engines.length >= 2) {
       setActiveWhiteStats(prev => ({ ...prev, name: engines[0].name }));
       setActiveBlackStats(prev => ({ ...prev, name: engines[1].name }));
    }

    const baseMs = Math.round((baseH * 3600 + baseM * 60 + baseS) * 1000);
    const incMs = Math.round((incH * 3600 + incM * 60 + incS) * 1000);

    const config = {
      mode: tournamentMode,
      engines: engines,
      time_control: { base_ms: baseMs, inc_ms: incMs },
      games_count: gamesCount,
      swap_sides: swapSides,
      opening_fen: (openingMode === 'fen' && openingFen) ? openingFen : null,
      opening_file: (openingMode === 'file' && openingFile) ? openingFile : null,
      variant: variant
    };
    await invoke("start_match", { config });
    // Switch to schedule tab automatically on start? User might like it.
    setActiveTab('schedule');
  };

  const stopMatch = async () => { await invoke("stop_match"); setMatchRunning(false); };
  const togglePause = async () => { await invoke("pause_match", { paused: !isPaused }); setIsPaused(!isPaused); };

  const addEngine = () => {
      setEngines([...engines, { name: `Engine ${engines.length + 1}`, path: "mock-engine", options: [] }]);
  };

  const removeEngine = (idx: number) => {
      if (engines.length <= 2) return; // Minimum 2 engines
      const newEngines = [...engines];
      newEngines.splice(idx, 1);
      setEngines(newEngines);
  };

  const updateEnginePath = (idx: number, path: string) => {
      const newEngines = [...engines];
      newEngines[idx].path = path;
      setEngines(newEngines);
  };

  const selectFileForEngine = async (idx: number) => {
    const selected = await open({ multiple: false, filters: [{ name: 'Executables', extensions: ['exe', ''] }] });
    if (selected && typeof selected === 'string') updateEnginePath(idx, selected);
  };

  const selectOpeningFile = async () => {
    const selected = await open({ multiple: false, filters: [{ name: 'Openings', extensions: ['epd', 'pgn'] }] });
    if (selected && typeof selected === 'string') setOpeningFile(selected);
  };

  return (
    <div className="h-screen w-screen bg-gray-900 text-white flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 bg-gray-800 flex flex-col border-r border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700 bg-gray-850 shrink-0">
            <h1 className="text-xl font-bold text-center text-blue-400 mb-2">Mini-TCEC</h1>

            {/* Tabs Header */}
            <div className="flex bg-gray-700 rounded p-1">
                <button
                    className={`flex-1 text-xs font-bold py-1.5 rounded ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                    onClick={() => setActiveTab('settings')}
                >
                    SETTINGS
                </button>
                <button
                    className={`flex-1 text-xs font-bold py-1.5 rounded ${activeTab === 'schedule' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                    onClick={() => setActiveTab('schedule')}
                >
                    SCHEDULE
                </button>
            </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {activeTab === 'settings' ? (
                <>
                    {/* Tournament Mode */}
                    <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-400 uppercase">Tournament Mode</label>
                    <select className="bg-gray-700 p-2 rounded w-full text-xs" value={tournamentMode} onChange={(e) => setTournamentMode(e.target.value as any)}>
                        <option value="Match">Match (1v1)</option>
                        <option value="RoundRobin">Round Robin</option>
                        <option value="Gauntlet">Gauntlet</option>
                    </select>
                    </div>

                    {/* Engine List */}
                    <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-semibold text-gray-400 uppercase">Engines ({engines.length})</label>
                        <button className="bg-green-600 px-2 py-0.5 rounded text-[10px] hover:bg-green-500" onClick={addEngine}>+ ADD</button>
                    </div>
                    <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                        {engines.map((eng, idx) => (
                            <div key={idx} className="bg-gray-700 p-2 rounded flex flex-col gap-1">
                            <div className="flex justify-between">
                                <span className="text-xs font-bold">{eng.name}</span>
                                {engines.length > 2 && <button className="text-red-400 text-xs hover:text-red-300" onClick={() => removeEngine(idx)}>X</button>}
                            </div>
                            <div className="flex gap-1">
                                <input className="bg-gray-600 p-1 rounded w-full text-[10px]" value={eng.path} onChange={(e) => updateEnginePath(idx, e.target.value)} title={eng.path} />
                                <button className="bg-blue-600 px-2 rounded hover:bg-blue-500 text-[10px]" onClick={() => selectFileForEngine(idx)}>...</button>
                            </div>
                            </div>
                        ))}
                    </div>
                    </div>

                    {/* Time Control */}
                    <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-400 uppercase">Time Control</label>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <span className="text-[10px] text-gray-500 block mb-1">Base (H:M:S)</span>
                            <div className="flex gap-1">
                            <input type="number" min="0" className="bg-gray-700 p-1 rounded w-full text-xs text-center" placeholder="H" value={baseH} onChange={(e) => setBaseH(parseInt(e.target.value) || 0)} />
                            <span className="text-gray-500 self-center">:</span>
                            <input type="number" min="0" className="bg-gray-700 p-1 rounded w-full text-xs text-center" placeholder="M" value={baseM} onChange={(e) => setBaseM(parseInt(e.target.value) || 0)} />
                            <span className="text-gray-500 self-center">:</span>
                            <input type="number" min="0" step="0.1" className="bg-gray-700 p-1 rounded w-full text-xs text-center" placeholder="S" value={baseS} onChange={(e) => setBaseS(parseFloat(e.target.value) || 0)} />
                            </div>
                        </div>
                        <div>
                            <span className="text-[10px] text-gray-500 block mb-1">Inc (H:M:S)</span>
                            <div className="flex gap-1">
                            <input type="number" min="0" className="bg-gray-700 p-1 rounded w-full text-xs text-center" placeholder="H" value={incH} onChange={(e) => setIncH(parseInt(e.target.value) || 0)} />
                            <span className="text-gray-500 self-center">:</span>
                            <input type="number" min="0" className="bg-gray-700 p-1 rounded w-full text-xs text-center" placeholder="M" value={incM} onChange={(e) => setIncM(parseInt(e.target.value) || 0)} />
                            <span className="text-gray-500 self-center">:</span>
                            <input type="number" min="0" step="0.1" className="bg-gray-700 p-1 rounded w-full text-xs text-center" placeholder="S" value={incS} onChange={(e) => setIncS(parseFloat(e.target.value) || 0)} />
                            </div>
                        </div>
                    </div>
                    </div>

                    <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-400 uppercase">Variant</label>
                    <select className="bg-gray-700 p-2 rounded w-full text-xs" value={variant} onChange={(e) => setVariant(e.target.value)}>
                        <option value="standard">Standard</option>
                        <option value="chess960">Chess960</option>
                    </select>
                    </div>

                    {/* Opening Selection */}
                    <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-semibold text-gray-400 uppercase">Opening</label>
                        <div className="flex bg-gray-700 rounded p-0.5">
                        <button className={`px-2 py-0.5 text-[10px] rounded ${openingMode === 'fen' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`} onClick={() => setOpeningMode('fen')}>FEN</button>
                        <button className={`px-2 py-0.5 text-[10px] rounded ${openingMode === 'file' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`} onClick={() => setOpeningMode('file')}>FILE</button>
                        </div>
                    </div>

                    {openingMode === 'fen' ? (
                        <input className="bg-gray-700 p-2 rounded w-full text-xs" placeholder="Leave empty for start pos / random 960" value={openingFen} onChange={(e) => setOpeningFen(e.target.value)} />
                    ) : (
                        <div className="flex gap-2">
                        <input className="bg-gray-700 p-2 rounded w-full text-xs" placeholder="Select .epd or .pgn..." value={openingFile} readOnly />
                        <button className="bg-blue-600 px-3 py-1 rounded hover:bg-blue-500 text-xs" onClick={selectOpeningFile}>...</button>
                        </div>
                    )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2">
                        <input type="checkbox" checked={swapSides} onChange={(e) => setSwapSides(e.target.checked)} />
                        <span className="text-sm">Swap Sides</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm">Games/Pair:</span>
                        <input type="number" className="bg-gray-700 p-1 rounded w-16 text-xs" value={gamesCount} onChange={(e) => setGamesCount(parseInt(e.target.value))} />
                    </div>
                    </div>
                </>
            ) : (
                // Schedule Tab Content
                <div className="space-y-2">
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-semibold text-gray-400 uppercase">Upcoming Games</label>
                        <span className="text-xs text-gray-500">{schedule.length} Total</span>
                    </div>
                    <div className="flex flex-col gap-2">
                        {schedule.map((game) => (
                            <div key={game.id} className={`p-2 rounded text-xs border border-gray-700 flex flex-col gap-1 ${game.state === 'Active' ? 'bg-blue-900/30 border-blue-600' : 'bg-gray-700'}`}>
                                <div className="flex justify-between font-bold">
                                    <span>#{game.id}</span>
                                    <span className={`${
                                        game.state === 'Finished' ? 'text-gray-400' :
                                        game.state === 'Active' ? 'text-green-400' :
                                        'text-yellow-500'
                                    }`}>{game.state}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-white">{game.white_name}</span>
                                    <span className="text-gray-500 font-mono text-[10px]">vs</span>
                                    <span className="text-white">{game.black_name}</span>
                                </div>
                                {game.result && (
                                    <div className="mt-1 text-center font-mono font-bold text-yellow-400 bg-gray-800 rounded py-0.5">
                                        {game.result}
                                    </div>
                                )}
                            </div>
                        ))}
                        {schedule.length === 0 && (
                            <div className="text-center text-gray-500 text-xs italic py-4">No games scheduled.</div>
                        )}
                    </div>
                </div>
            )}
        </div>

        {/* Footer Actions (Always Visible) */}
        <div className="p-4 border-t border-gray-700 bg-gray-850 shrink-0">
            <div className="flex flex-col gap-2">
            {!matchRunning ? (
                <button className="bg-green-600 p-3 rounded font-bold hover:bg-green-500 transition" onClick={startMatch}>START TOURNAMENT</button>
            ) : (
                <div className="flex gap-2">
                <button className={`flex-1 p-3 rounded font-bold transition ${isPaused ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-gray-600 hover:bg-gray-500'}`} onClick={togglePause}>
                    {isPaused ? "RESUME" : "PAUSE"}
                </button>
                <button className="flex-1 bg-red-600 p-3 rounded font-bold hover:bg-red-500 transition" onClick={stopMatch}>STOP</button>
                </div>
            )}
            </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-4 gap-4 bg-gray-900 overflow-hidden">
        {/* Top Panels */}
        <div className="grid grid-cols-3 gap-4 h-full min-h-0">

          {/* Left: Engine A Info (Currently active White) */}
          <div className="bg-gray-800 rounded-lg p-4 flex flex-col gap-2 border border-gray-700 shadow-lg">
             <EnginePanel stats={activeWhiteStats} />
             <div className="flex-1 bg-gray-900 rounded border border-gray-700 p-2 overflow-y-auto font-mono text-xs text-green-400">
               {/* Engine Log Placeholder */}
               <div>[{activeWhiteStats.name}] readyok</div>
             </div>
          </div>

          {/* Center: Board */}
          <div className="flex flex-col gap-2 items-center justify-center bg-gray-800 rounded-lg p-4 border border-gray-700 shadow-lg relative">
             <div className="text-2xl font-bold text-gray-200 mb-2 flex flex-col items-center">
               {matchResult ? <span className="text-yellow-400">{matchResult}</span> : <span>Game in Progress...</span>}
               {tournamentStats && (
                   <span className="text-xs text-blue-400 mt-1">
                       Score: +{tournamentStats.wins} -{tournamentStats.losses} ={tournamentStats.draws} | {tournamentStats.sprt_status}
                   </span>
               )}
             </div>

             {/* Black Engine (Top) */}
             <div className="w-full flex justify-between items-end px-4 mb-1">
                 <span className="text-gray-400 font-mono text-xs">BLACK</span>
                 <span className="text-white font-bold text-lg">{activeBlackStats.name}</span>
                 <span className="text-gray-400 font-mono text-xs">{activeBlackStats.score ? (activeBlackStats.score / 100).toFixed(2) : "0.00"}</span>
             </div>

             <Board fen={fen} lastMove={lastMove} config={{ movable: { viewOnly: true } }} />

             {/* White Engine (Bottom) */}
             <div className="w-full flex justify-between items-start px-4 mt-1">
                 <span className="text-gray-400 font-mono text-xs">WHITE</span>
                 <span className="text-white font-bold text-lg">{activeWhiteStats.name}</span>
                 <span className="text-gray-400 font-mono text-xs">{activeWhiteStats.score ? (activeWhiteStats.score / 100).toFixed(2) : "0.00"}</span>
             </div>
          </div>

          {/* Right: Engine B Info (Currently active Black) */}
          <div className="bg-gray-800 rounded-lg p-4 flex flex-col gap-2 border border-gray-700 shadow-lg">
             <EnginePanel stats={activeBlackStats} />
             <div className="flex-1 bg-gray-900 rounded border border-gray-700 p-2 overflow-y-auto font-mono text-xs text-blue-400">
                {/* Engine Log Placeholder */}
                <div>[{activeBlackStats.name}] readyok</div>
             </div>
          </div>
        </div>

        {/* Bottom: Graphs & Move List */}
        <div className="h-64 grid grid-cols-3 gap-4 shrink-0">
           <div className="col-span-2 bg-gray-800 rounded-lg border border-gray-700 p-2 flex flex-col">
              <h3 className="text-xs font-bold text-gray-400 mb-1 ml-2">Evaluation History</h3>
              <div className="flex-1 w-full h-full">
                 <EvalGraph data={evalHistory} />
              </div>
           </div>
           <div className="bg-gray-800 rounded-lg border border-gray-700 p-2 flex flex-col">
              <h3 className="text-xs font-bold text-gray-400 mb-1 ml-2">Move List</h3>
              <div className="flex-1 overflow-y-auto">
                 <MoveList moves={moves} />
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

export default App;
