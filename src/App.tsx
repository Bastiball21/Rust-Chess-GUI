import { useState, useEffect, useMemo } from "react";
import { Board } from "./components/Board";
import { EnginePanel } from "./components/EnginePanel";
import { PvBoard } from "./components/PvBoard";
import { EvalGraph } from "./components/EvalGraph";
import { MoveList } from "./components/MoveList";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import { open } from "@tauri-apps/plugin-dialog";
import { Cog, Plus, Trash2, FolderOpen } from 'lucide-react';
import countries from "./countries.json"; // We will create this or inline it

// Inline country list for simplicity if file doesn't exist yet, but cleaner to have a file.
// For now, I'll assume we can just use a simple list or fetch it?
// Actually, let's just make a simple object here to avoid file IO issues in this turn.
const COUNTRIES: Record<string, string> = {
    "us": "United States", "gb": "United Kingdom", "de": "Germany", "fr": "France",
    "ru": "Russia", "cn": "China", "in": "India", "it": "Italy", "es": "Spain",
    "nl": "Netherlands", "no": "Norway", "se": "Sweden", "pl": "Poland",
    "ua": "Ukraine", "cz": "Czechia", "br": "Brazil", "ar": "Argentina"
};

interface GameUpdate {
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

interface TimeUpdate {
    white_time: number;
    black_time: number;
    game_id: number;
}

interface EngineStatsPayload {
  engine_idx: number;
  depth: number;
  score_cp: number;
  nodes: number;
  nps: number;
  pv: string;
  game_id: number;
}

interface EngineConfig {
  name: string;
  path: string;
  options: [string, string][];
  country_code?: string;
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
  const [activeWhiteStats, setActiveWhiteStats] = useState({ name: "White", score: 0, pv: "", time: 0, country_code: "" });
  const [activeBlackStats, setActiveBlackStats] = useState({ name: "Black", score: 0, pv: "", time: 0, country_code: "" });

  const [whiteEngineIdx, setWhiteEngineIdx] = useState(0);
  const [blackEngineIdx, setBlackEngineIdx] = useState(1);

  const [evalHistory, setEvalHistory] = useState<any[]>([]);
  const [matchResult, setMatchResult] = useState<string | null>(null);

  const [tournamentMode, setTournamentMode] = useState<"Match" | "RoundRobin" | "Gauntlet">("Match");
  const [engines, setEngines] = useState<EngineConfig[]>([
    { name: "Engine 1", path: "mock-engine", options: [] },
    { name: "Engine 2", path: "mock-engine", options: [] }
  ]);

  const [gamesCount, setGamesCount] = useState(10);
  const [concurrency, setConcurrency] = useState(4);
  const [swapSides, setSwapSides] = useState(true);
  const [openingFen, setOpeningFen] = useState("");
  const [openingFile, setOpeningFile] = useState("");
  const [openingMode, setOpeningMode] = useState<'fen' | 'file'>('fen');
  const [variant, setVariant] = useState("standard");

  const [baseH, setBaseH] = useState(0);
  const [baseM, setBaseM] = useState(1);
  const [baseS, setBaseS] = useState(0);
  const [incH, setIncH] = useState(0);
  const [incM, setIncM] = useState(0);
  const [incS, setIncS] = useState(1);

  const [isPaused, setIsPaused] = useState(false);
  const [matchRunning, setMatchRunning] = useState(false);
  const [store, setStore] = useState<any>(null);

  const [activeTab, setActiveTab] = useState<'settings' | 'schedule'>('settings');
  const [schedule, setSchedule] = useState<ScheduledGame[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);

  const [tournamentStats, setTournamentStats] = useState<any>(null);

  // Modal State for Engine Settings
  const [editingEngineIdx, setEditingEngineIdx] = useState<number | null>(null);

  // Sync engine names/flags if changed
  useEffect(() => {
      const wEng = engines[whiteEngineIdx];
      const bEng = engines[blackEngineIdx];
      if (wEng && (wEng.name !== activeWhiteStats.name || wEng.country_code !== activeWhiteStats.country_code)) {
          setActiveWhiteStats(prev => ({ ...prev, name: wEng.name, country_code: wEng.country_code || "" }));
      }
      if (bEng && (bEng.name !== activeBlackStats.name || bEng.country_code !== activeBlackStats.country_code)) {
          setActiveBlackStats(prev => ({ ...prev, name: bEng.name, country_code: bEng.country_code || "" }));
      }
  }, [engines, whiteEngineIdx, blackEngineIdx]);

  useEffect(() => {
    const initStore = async () => {
      const s = await load('settings.json');
      setStore(s);
      const savedEngines = await s.get("engines");
      if (savedEngines) setEngines(savedEngines as EngineConfig[]);
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
      if (selectedGameId === null && u.game_id) setSelectedGameId(u.game_id);
      if (selectedGameId !== null && u.game_id !== selectedGameId) return;

      setFen(u.fen);
      if (u.last_move) {
        setMoves(prev => [...prev, u.last_move!]);
        const from = u.last_move.substring(0, 2);
        const to = u.last_move.substring(2, 4);
        setLastMove([from, to]);
      }
      setWhiteEngineIdx(u.white_engine_idx);
      setBlackEngineIdx(u.black_engine_idx);

      // Update times (fallback if TimeUpdate misses)
      setActiveWhiteStats(s => ({ ...s, time: u.white_time }));
      setActiveBlackStats(s => ({ ...s, time: u.black_time }));

      if (u.result) setMatchResult(`Game Over: ${u.result}`);
    });

    const unlistenTime = listen("time-update", (event: any) => {
        const t = event.payload as TimeUpdate;
        if (selectedGameId !== null && t.game_id !== selectedGameId) return;
        setActiveWhiteStats(s => ({ ...s, time: t.white_time }));
        setActiveBlackStats(s => ({ ...s, time: t.black_time }));
    });

    const unlistenStats = listen("engine-stats", (event: any) => {
      const s = event.payload as EngineStatsPayload;
      if (selectedGameId !== null && s.game_id !== selectedGameId) return;
      const update = { depth: s.depth, score: s.score_cp, nodes: s.nodes, nps: s.nps, pv: s.pv };
      if (whiteEngineIdx === s.engine_idx) setActiveWhiteStats(prev => ({...prev, ...update}));
      if (blackEngineIdx === s.engine_idx) setActiveBlackStats(prev => ({...prev, ...update}));
    });

    const unlistenTourneyStats = listen("tournament-stats", (event: any) => setTournamentStats(event.payload));

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

    return () => {
      unlistenUpdate.then(f => f());
      unlistenTime.then(f => f());
      unlistenStats.then(f => f());
      unlistenTourneyStats.then(f => f());
      unlistenSchedule.then(f => f());
    };
  }, [engines, selectedGameId, whiteEngineIdx, blackEngineIdx]);

  useEffect(() => {
    if (moves.length > 0) {
      setEvalHistory(prev => [...prev, { moveNumber: moves.length, score: activeWhiteStats.score || 0 }]);
    } else {
      setEvalHistory([]);
    }
  }, [moves, activeWhiteStats.score]);

  const clearGameState = () => {
      setMoves([]); setLastMove([]); setMatchResult(null); setEvalHistory([]); setFen("start");
      setActiveWhiteStats(s => ({...s, score: 0, pv: ""}));
      setActiveBlackStats(s => ({...s, score: 0, pv: ""}));
  };

  const startMatch = async () => {
    clearGameState();
    setMatchRunning(true);
    setIsPaused(false);
    setSchedule([]);
    setSelectedGameId(null);
    if (engines.length >= 2) {
       setActiveWhiteStats(prev => ({ ...prev, name: engines[0].name, country_code: engines[0].country_code || "" }));
       setActiveBlackStats(prev => ({ ...prev, name: engines[1].name, country_code: engines[1].country_code || "" }));
    }
    const baseMs = Math.round((baseH * 3600 + baseM * 60 + baseS) * 1000);
    const incMs = Math.round((incH * 3600 + incM * 60 + incS) * 1000);
    const config = {
      mode: tournamentMode, engines: engines, time_control: { base_ms: baseMs, inc_ms: incMs },
      games_count: gamesCount, concurrency: concurrency, swap_sides: swapSides,
      opening_fen: (openingMode === 'fen' && openingFen) ? openingFen : null,
      opening_file: (openingMode === 'file' && openingFile) ? openingFile : null,
      variant: variant
    };
    await invoke("start_match", { config });
    setActiveTab('schedule');
  };

  const stopMatch = async () => { await invoke("stop_match"); setMatchRunning(false); };
  const togglePause = async () => { await invoke("pause_match", { paused: !isPaused }); setIsPaused(!isPaused); };

  const addEngine = () => { setEngines([...engines, { name: `Engine ${engines.length + 1}`, path: "mock-engine", options: [] }]); };
  const removeEngine = (idx: number) => { if (engines.length > 2) { const n = [...engines]; n.splice(idx, 1); setEngines(n); } };
  const updateEnginePath = (idx: number, path: string) => { const n = [...engines]; n[idx].path = path; setEngines(n); };
  const updateEngineName = (idx: number, name: string) => { const n = [...engines]; n[idx].name = name; setEngines(n); };
  const updateEngineFlag = (idx: number, code: string) => { const n = [...engines]; n[idx].country_code = code; setEngines(n); };

  // Option Handling
  const updateEngineOption = (engIdx: number, optName: string, optVal: string) => {
      const n = [...engines];
      const opts = n[engIdx].options;
      const existing = opts.findIndex(o => o[0] === optName);
      if (existing >= 0) opts[existing][1] = optVal;
      else opts.push([optName, optVal]);
      setEngines(n);
  };
  const removeEngineOption = (engIdx: number, optName: string) => {
      const n = [...engines];
      n[engIdx].options = n[engIdx].options.filter(o => o[0] !== optName);
      setEngines(n);
  };

  const selectFileForEngine = async (idx: number) => {
    const selected = await open({ multiple: false, filters: [{ name: 'Executables', extensions: ['exe', ''] }] });
    if (selected && typeof selected === 'string') updateEnginePath(idx, selected);
  };
  const selectOpeningFile = async () => {
    const selected = await open({ multiple: false, filters: [{ name: 'Openings', extensions: ['epd', 'pgn'] }] });
    if (selected && typeof selected === 'string') setOpeningFile(selected);
  };

  const handleGameSelect = (id: number) => { setSelectedGameId(id); clearGameState(); };
  const copyPgn = async () => {
       let pgn = `[White "${activeWhiteStats.name}"]\n[Black "${activeBlackStats.name}"]\n\n`;
       moves.forEach((m, i) => { if (i % 2 === 0) pgn += `${i/2 + 1}. `; pgn += m + " "; });
       await navigator.clipboard.writeText(pgn);
       alert("PGN copied to clipboard!");
  };

  const pvShapes = useMemo(() => {
      const shapes: any[] = [];
      if (activeWhiteStats.pv) {
          const parts = activeWhiteStats.pv.split(" ");
          if (parts.length > 0 && parts[0].length >= 4) shapes.push({ brush: 'green', orig: parts[0].slice(0,2), dest: parts[0].slice(2,4) });
      }
      if (activeBlackStats.pv) {
          const parts = activeBlackStats.pv.split(" ");
          if (parts.length > 0 && parts[0].length >= 4) shapes.push({ brush: 'blue', orig: parts[0].slice(0,2), dest: parts[0].slice(2,4) });
      }
      return shapes;
  }, [activeWhiteStats.pv, activeBlackStats.pv]);

  return (
    <div className="h-screen w-screen bg-gray-900 text-white flex overflow-hidden">
      {/* Modal for Engine Options */}
      {editingEngineIdx !== null && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
              <div className="bg-gray-800 p-6 rounded-lg w-96 max-h-[80vh] overflow-y-auto border border-gray-600 shadow-2xl">
                  <h2 className="text-xl font-bold mb-4">Edit Engine: {engines[editingEngineIdx].name}</h2>

                  {/* Flag Selection */}
                  <div className="mb-4">
                      <label className="text-xs font-semibold text-gray-400 block mb-1">Country Flag</label>
                      <select
                        className="bg-gray-700 p-2 rounded w-full text-xs"
                        value={engines[editingEngineIdx].country_code || ""}
                        onChange={(e) => updateEngineFlag(editingEngineIdx, e.target.value)}
                      >
                          <option value="">No Flag</option>
                          {Object.entries(COUNTRIES).map(([code, name]) => (
                              <option key={code} value={code}>{name}</option>
                          ))}
                      </select>
                  </div>

                  {/* Custom UCI Options */}
                  <div className="mb-4">
                      <label className="text-xs font-semibold text-gray-400 block mb-1">UCI Options</label>
                      <div className="flex flex-col gap-2">
                          {engines[editingEngineIdx].options.map(([key, val], i) => (
                              <div key={i} className="flex gap-1 items-center">
                                  <input className="bg-gray-700 p-1 rounded w-1/3 text-xs" value={key} readOnly />
                                  <input
                                    className="bg-gray-700 p-1 rounded w-1/3 text-xs"
                                    value={val}
                                    onChange={(e) => updateEngineOption(editingEngineIdx, key, e.target.value)}
                                  />
                                  <button className="text-red-400 hover:text-red-300" onClick={() => removeEngineOption(editingEngineIdx, key)}><Trash2 size={14}/></button>
                              </div>
                          ))}
                      </div>
                      <div className="mt-2 flex gap-1">
                          <input id="newOptName" className="bg-gray-700 p-1 rounded w-1/3 text-xs" placeholder="Name (e.g. Hash)" />
                          <input id="newOptVal" className="bg-gray-700 p-1 rounded w-1/3 text-xs" placeholder="Value" />
                          <button
                            className="bg-green-600 px-2 rounded hover:bg-green-500 text-xs flex items-center"
                            onClick={() => {
                                const nameInput = document.getElementById("newOptName") as HTMLInputElement;
                                const valInput = document.getElementById("newOptVal") as HTMLInputElement;
                                if (nameInput.value && valInput.value) {
                                    updateEngineOption(editingEngineIdx, nameInput.value, valInput.value);
                                    nameInput.value = ""; valInput.value = "";
                                }
                            }}
                          >
                              <Plus size={14} />
                          </button>
                      </div>
                  </div>

                  <button className="bg-blue-600 px-4 py-2 rounded w-full font-bold hover:bg-blue-500" onClick={() => setEditingEngineIdx(null)}>Close</button>
              </div>
          </div>
      )}

      {/* Sidebar */}
      <div className="w-80 bg-gray-800 flex flex-col border-r border-gray-700 overflow-hidden shrink-0 z-10 relative">
        {/* Header and Tabs - Same as before */}
        <div className="p-4 border-b border-gray-700 bg-gray-850 shrink-0">
            <h1 className="text-xl font-bold text-center text-blue-400 mb-2">CCRL GUI</h1>
            <div className="flex bg-gray-700 rounded p-1">
                <button className={`flex-1 text-xs font-bold py-1.5 rounded ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`} onClick={() => setActiveTab('settings')}>SETTINGS</button>
                <button className={`flex-1 text-xs font-bold py-1.5 rounded ${activeTab === 'schedule' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`} onClick={() => setActiveTab('schedule')}>SCHEDULE</button>
            </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {activeTab === 'settings' ? (
                <>
                    {/* Tournament Mode & Engines */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-gray-400 uppercase">Tournament Mode</label>
                        <select className="bg-gray-700 p-2 rounded w-full text-xs" value={tournamentMode} onChange={(e) => setTournamentMode(e.target.value as any)}>
                            <option value="Match">Match (1v1)</option>
                            <option value="RoundRobin">Round Robin</option>
                            <option value="Gauntlet">Gauntlet</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-semibold text-gray-400 uppercase">Engines ({engines.length})</label>
                            <button className="bg-green-600 px-2 py-0.5 rounded text-[10px] hover:bg-green-500" onClick={addEngine}>+ ADD</button>
                        </div>
                        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                            {engines.map((eng, idx) => (
                                <div key={idx} className="bg-gray-700 p-2 rounded flex flex-col gap-1 relative">
                                    <div className="flex justify-between items-center gap-2">
                                        <div className="flex items-center gap-1 w-full">
                                            {eng.country_code && <img src={`https://flagcdn.com/w20/${eng.country_code}.png`} className="w-4 h-3" />}
                                            <input className="bg-transparent text-xs font-bold border-b border-gray-600 focus:border-blue-500 outline-none w-full" value={eng.name} onChange={(e) => updateEngineName(idx, e.target.value)} />
                                        </div>
                                        <div className="flex gap-1">
                                            <button className="text-gray-400 hover:text-white" onClick={() => setEditingEngineIdx(idx)}><Cog size={14}/></button>
                                            {engines.length > 2 && <button className="text-red-400 text-xs hover:text-red-300" onClick={() => removeEngine(idx)}><Trash2 size={14}/></button>}
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <input className="bg-gray-600 p-1 rounded w-full text-[10px]" value={eng.path} onChange={(e) => updateEnginePath(idx, e.target.value)} title={eng.path} />
                                        <button className="bg-blue-600 px-2 rounded hover:bg-blue-500 text-[10px] flex items-center justify-center" onClick={() => selectFileForEngine(idx)}><FolderOpen size={10} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* Time & Options */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-gray-400 uppercase">Time Control</label>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <span className="text-[10px] text-gray-500 block mb-1">Base (H:M:S)</span>
                                <div className="flex gap-1">
                                    <input type="number" className="bg-gray-700 p-1 rounded w-full text-xs text-center" value={baseH} onChange={(e) => setBaseH(parseInt(e.target.value) || 0)} />
                                    <span className="text-gray-500">:</span>
                                    <input type="number" className="bg-gray-700 p-1 rounded w-full text-xs text-center" value={baseM} onChange={(e) => setBaseM(parseInt(e.target.value) || 0)} />
                                    <span className="text-gray-500">:</span>
                                    <input type="number" className="bg-gray-700 p-1 rounded w-full text-xs text-center" value={baseS} onChange={(e) => setBaseS(parseFloat(e.target.value) || 0)} />
                                </div>
                            </div>
                            <div>
                                <span className="text-[10px] text-gray-500 block mb-1">Inc (H:M:S)</span>
                                <div className="flex gap-1">
                                    <input type="number" className="bg-gray-700 p-1 rounded w-full text-xs text-center" value={incH} onChange={(e) => setIncH(parseInt(e.target.value) || 0)} />
                                    <span className="text-gray-500">:</span>
                                    <input type="number" className="bg-gray-700 p-1 rounded w-full text-xs text-center" value={incM} onChange={(e) => setIncM(parseInt(e.target.value) || 0)} />
                                    <span className="text-gray-500">:</span>
                                    <input type="number" className="bg-gray-700 p-1 rounded w-full text-xs text-center" value={incS} onChange={(e) => setIncS(parseFloat(e.target.value) || 0)} />
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Other settings same as previous... */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-gray-400 uppercase">Opening</label>
                        <div className="flex justify-between items-center mb-1">
                            <div className="flex bg-gray-700 rounded p-0.5">
                                <button className={`px-2 py-0.5 text-[10px] rounded ${openingMode === 'fen' ? 'bg-blue-600 text-white' : 'text-gray-400'}`} onClick={() => setOpeningMode('fen')}>FEN</button>
                                <button className={`px-2 py-0.5 text-[10px] rounded ${openingMode === 'file' ? 'bg-blue-600 text-white' : 'text-gray-400'}`} onClick={() => setOpeningMode('file')}>FILE</button>
                            </div>
                        </div>
                        {openingMode === 'fen' ? (
                            <input className="bg-gray-700 p-2 rounded w-full text-xs" placeholder="FEN..." value={openingFen} onChange={(e) => setOpeningFen(e.target.value)} />
                        ) : (
                            <div className="flex gap-2">
                                <input className="bg-gray-700 p-2 rounded w-full text-xs" placeholder="Select file..." value={openingFile} readOnly />
                                <button className="bg-blue-600 px-3 py-1 rounded hover:bg-blue-500" onClick={selectOpeningFile}>...</button>
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-2"><input type="checkbox" checked={swapSides} onChange={(e) => setSwapSides(e.target.checked)} /><span className="text-sm">Swap Sides</span></div>
                        <div className="flex items-center gap-2"><span className="text-sm">Games:</span><input type="number" className="bg-gray-700 p-1 rounded w-16 text-xs" value={gamesCount} onChange={(e) => setGamesCount(parseInt(e.target.value))} /></div>
                    </div>
                </>
            ) : (
                <div className="space-y-2">
                    <div className="flex justify-between items-center mb-2"><label className="text-xs font-semibold text-gray-400 uppercase">Upcoming Games</label><span className="text-xs text-gray-500">{schedule.length} Total</span></div>
                    <div className="flex flex-col gap-2">
                        {schedule.map((game) => (
                            <div key={game.id} className={`p-2 rounded text-xs border flex flex-col gap-1 cursor-pointer transition ${game.state === 'Active' ? 'bg-blue-900/30 border-blue-600' : 'bg-gray-700 border-gray-700'} ${selectedGameId === game.id ? 'ring-2 ring-yellow-400' : ''}`} onClick={() => handleGameSelect(game.id)}>
                                <div className="flex justify-between font-bold"><span>#{game.id}</span><span className={game.state === 'Active' ? 'text-green-400' : 'text-gray-400'}>{game.state}</span></div>
                                <div className="flex justify-between items-center"><span className="text-white">{game.white_name}</span><span className="text-gray-500 font-mono">vs</span><span className="text-white">{game.black_name}</span></div>
                                {game.result && <div className="mt-1 text-center font-mono font-bold text-yellow-400 bg-gray-800 rounded py-0.5">{game.result}</div>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
        <div className="p-4 border-t border-gray-700 bg-gray-850 shrink-0">
             {!matchRunning ? <button className="bg-green-600 p-3 rounded font-bold hover:bg-green-500 w-full" onClick={startMatch}>START</button> : <button className="bg-red-600 p-3 rounded font-bold hover:bg-red-500 w-full" onClick={stopMatch}>STOP</button>}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-4 gap-4 bg-gray-900 overflow-hidden">
        <div className="grid grid-cols-3 gap-4 h-full min-h-0">
          <div className="bg-gray-800 rounded-lg p-4 flex flex-col gap-2 border border-gray-700 shadow-lg overflow-hidden">
             <EnginePanel stats={activeWhiteStats} side="white" />
             <div className="flex-1 min-h-0 flex gap-2"><PvBoard pv={activeWhiteStats.pv} currentFen={fen} side="white" /><div className="flex-1 bg-gray-900 rounded border border-gray-700 p-2 overflow-y-auto font-mono text-xs text-green-400"><div>[{activeWhiteStats.name}] readyok</div></div></div>
          </div>
          <div className="flex flex-col gap-2 items-center justify-center bg-gray-800 rounded-lg p-4 border border-gray-700 shadow-lg relative">
             <div className="text-2xl font-bold text-gray-200 mb-2 flex flex-col items-center">
               {matchResult ? <span className="text-yellow-400">{matchResult}</span> : <span>Game in Progress...</span>}
               {tournamentStats && <span className="text-xs text-blue-400 mt-1">Score: +{tournamentStats.wins} -{tournamentStats.losses} ={tournamentStats.draws} | {tournamentStats.sprt_status}</span>}
             </div>
             <div className="w-full flex justify-between items-end px-4 mb-1"><span className="text-gray-400 font-mono text-xs">BLACK</span><div className="flex items-center gap-1"><Flag code={activeBlackStats.country_code} /><span className="text-white font-bold text-lg">{activeBlackStats.name}</span></div><span className="text-gray-400 font-mono text-xs">{activeBlackStats.score ? (activeBlackStats.score / 100).toFixed(2) : "0.00"}</span></div>
             <Board fen={fen} lastMove={lastMove} config={{ movable: { viewOnly: true }, drawable: { visible: true } }} shapes={pvShapes} />
             <div className="w-full flex justify-between items-start px-4 mt-1"><span className="text-gray-400 font-mono text-xs">WHITE</span><div className="flex items-center gap-1"><Flag code={activeWhiteStats.country_code} /><span className="text-white font-bold text-lg">{activeWhiteStats.name}</span></div><span className="text-gray-400 font-mono text-xs">{activeWhiteStats.score ? (activeWhiteStats.score / 100).toFixed(2) : "0.00"}</span></div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 flex flex-col gap-2 border border-gray-700 shadow-lg overflow-hidden">
             <EnginePanel stats={activeBlackStats} side="black" />
             <div className="flex-1 min-h-0 flex gap-2"><PvBoard pv={activeBlackStats.pv} currentFen={fen} side="black" /><div className="flex-1 bg-gray-900 rounded border border-gray-700 p-2 overflow-y-auto font-mono text-xs text-blue-400"><div>[{activeBlackStats.name}] readyok</div></div></div>
          </div>
        </div>
        <div className="h-64 grid grid-cols-3 gap-4 shrink-0">
           <div className="col-span-2 bg-gray-800 rounded-lg border border-gray-700 p-2 flex flex-col"><h3 className="text-xs font-bold text-gray-400 mb-1 ml-2">Evaluation History</h3><div className="flex-1 w-full h-full"><EvalGraph data={evalHistory} /></div></div>
           <div className="bg-gray-800 rounded-lg border border-gray-700 p-2 flex flex-col"><div className="flex justify-between items-center mb-1 mx-2"><h3 className="text-xs font-bold text-gray-400">Move List</h3><button onClick={copyPgn} className="text-[10px] bg-gray-700 px-2 py-0.5 rounded hover:bg-gray-600 text-blue-300">COPY PGN</button></div><div className="flex-1 overflow-y-auto"><MoveList moves={moves} /></div></div>
        </div>
      </div>
    </div>
  );
}

const Flag: React.FC<{ code?: string }> = ({ code }) => {
    if (!code) return null;
    return <img src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`} width="20" alt={code} className="rounded-sm shadow-sm" />;
};

export default App;
