import { useState, useEffect, useMemo, useRef } from "react";
import { Board } from "./components/Board";
import { EnginePanel } from "./components/EnginePanel";
import { PvBoard } from "./components/PvBoard";
import { EvalGraph } from "./components/EvalGraph";
import { MoveList } from "./components/MoveList";
import EngineManager from "./components/EngineManager";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import { open, save } from "@tauri-apps/plugin-dialog";
import { appDataDir } from "@tauri-apps/api/path";
import { Cog, Plus, Trash2, FolderOpen, Save, Database, Play } from 'lucide-react';

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
  id?: string;
  name: string;
  path: string;
  options: [string, string][];
  country_code?: string;
  args?: string[];
  working_directory?: string;
  protocol?: string;
}

interface ScheduledGame {
  id: number;
  white_name: string;
  black_name: string;
  state: string;
  result: string | null;
}

interface GameStateData {
    fen: string;
    moves: string[];
    lastMove: string[];
    activeWhiteStats: { name: string; score: number; pv: string; time: number; country_code: string };
    activeBlackStats: { name: string; score: number; pv: string; time: number; country_code: string };
    matchResult: string | null;
    evalHistory: any[];
    whiteEngineIdx: number;
    blackEngineIdx: number;
}

const INITIAL_GAME_STATE: GameStateData = {
    fen: "start",
    moves: [],
    lastMove: [],
    activeWhiteStats: { name: "White", score: 0, pv: "", time: 0, country_code: "" },
    activeBlackStats: { name: "Black", score: 0, pv: "", time: 0, country_code: "" },
    matchResult: null,
    evalHistory: [],
    whiteEngineIdx: 0,
    blackEngineIdx: 1
};

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
    { id: "mock1", name: "Engine 1", path: "mock-engine", options: [] },
    { id: "mock2", name: "Engine 2", path: "mock-engine", options: [] }
  ]);
  const enginesRef = useRef(engines);

  // Keep enginesRef in sync
  useEffect(() => { enginesRef.current = engines; }, [engines]);

  // Engine Library State
  const [engineLibrary, setEngineLibrary] = useState<EngineConfig[]>([]);
  const [showEngineManager, setShowEngineManager] = useState(false);

  const [gamesCount, setGamesCount] = useState(10);
  const [concurrency, setConcurrency] = useState(4);
  const [swapSides, setSwapSides] = useState(true);
  const [openingFen, setOpeningFen] = useState("");
  const [openingFile, setOpeningFile] = useState("");
  const [openingMode, setOpeningMode] = useState<'fen' | 'file'>('fen');
  const [variant, setVariant] = useState("standard");
  const [eventName, setEventName] = useState("CCRL GUI Tournament");

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

  const selectedGameIdRef = useRef<number | null>(null);
  const gameStates = useRef<Record<number, GameStateData>>({});

  const [tournamentStats, setTournamentStats] = useState<any>(null);
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
      const savedEngines = await s.get("active_engines");
      const savedLibrary = await s.get("engine_library");
      if (savedEngines) setEngines(savedEngines as EngineConfig[]);
      if (savedLibrary) setEngineLibrary(savedLibrary as EngineConfig[]);
    };
    initStore();
  }, []);

  useEffect(() => {
    if (!store) return;
    store.set("active_engines", engines);
    store.set("engine_library", engineLibrary);
    store.save();
  }, [engines, engineLibrary, store]);

  // One-time listener registration (omitted detailed implementation for brevity as it's same as before)
  useEffect(() => {
    const unlistenUpdate = listen("game-update", (event: any) => {
        const u = event.payload as GameUpdate;
        const gameId = u.game_id;
        if (!gameStates.current[gameId]) {
            gameStates.current[gameId] = JSON.parse(JSON.stringify(INITIAL_GAME_STATE));
            const allEngines = enginesRef.current;
            if (allEngines.length > u.white_engine_idx) {
               gameStates.current[gameId].activeWhiteStats.name = allEngines[u.white_engine_idx].name;
               gameStates.current[gameId].activeWhiteStats.country_code = allEngines[u.white_engine_idx].country_code || "";
            }
            if (allEngines.length > u.black_engine_idx) {
               gameStates.current[gameId].activeBlackStats.name = allEngines[u.black_engine_idx].name;
               gameStates.current[gameId].activeBlackStats.country_code = allEngines[u.black_engine_idx].country_code || "";
            }
        }
        const state = gameStates.current[gameId];
        state.fen = u.fen;
        state.whiteEngineIdx = u.white_engine_idx;
        state.blackEngineIdx = u.black_engine_idx;
        state.activeWhiteStats.time = u.white_time;
        state.activeBlackStats.time = u.black_time;
        if (u.last_move) {
          state.moves.push(u.last_move);
          state.lastMove = [u.last_move.substring(0, 2), u.last_move.substring(2, 4)];
          state.evalHistory.push({ moveNumber: state.moves.length, score: state.activeWhiteStats.score || 0 });
        }
        if (u.result) state.matchResult = `Game Over: ${u.result}`;
        if (selectedGameIdRef.current === null || selectedGameIdRef.current === gameId) {
            if (selectedGameIdRef.current === null) { setSelectedGameId(gameId); selectedGameIdRef.current = gameId; }
            setFen(state.fen); setMoves([...state.moves]); setLastMove([...state.lastMove]);
            setWhiteEngineIdx(state.whiteEngineIdx); setBlackEngineIdx(state.blackEngineIdx);
            setActiveWhiteStats({...state.activeWhiteStats}); setActiveBlackStats({...state.activeBlackStats});
            setMatchResult(state.matchResult); setEvalHistory([...state.evalHistory]);
        }
    });

    const unlistenTime = listen("time-update", (event: any) => {
        const t = event.payload as TimeUpdate;
        const state = gameStates.current[t.game_id];
        if (!state) return;
        state.activeWhiteStats.time = t.white_time;
        state.activeBlackStats.time = t.black_time;
        if (selectedGameIdRef.current === t.game_id) {
            setActiveWhiteStats(s => ({ ...s, time: t.white_time }));
            setActiveBlackStats(s => ({ ...s, time: t.black_time }));
        }
    });

    const unlistenStats = listen("engine-stats", (event: any) => {
      const s = event.payload as EngineStatsPayload;
      const state = gameStates.current[s.game_id];
      if (!state) return;
      const update = { depth: s.depth, score: s.score_cp, nodes: s.nodes, nps: s.nps, pv: s.pv };
      if (state.whiteEngineIdx === s.engine_idx) Object.assign(state.activeWhiteStats, update);
      if (state.blackEngineIdx === s.engine_idx) Object.assign(state.activeBlackStats, update);
      if (selectedGameIdRef.current === s.game_id) {
          if (state.whiteEngineIdx === s.engine_idx) setActiveWhiteStats(prev => ({...prev, ...update}));
          if (state.blackEngineIdx === s.engine_idx) setActiveBlackStats(prev => ({...prev, ...update}));
      }
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
            } else { return [...prev, update]; }
        });
    });

    return () => {
      unlistenUpdate.then(f => f()); unlistenTime.then(f => f()); unlistenStats.then(f => f());
      unlistenTourneyStats.then(f => f()); unlistenSchedule.then(f => f());
    };
  }, []);

  const clearGameState = () => {
      setMoves([]); setLastMove([]); setMatchResult(null); setEvalHistory([]); setFen("start");
      setActiveWhiteStats(s => ({...s, score: 0, pv: ""})); setActiveBlackStats(s => ({...s, score: 0, pv: ""}));
  };

  const startMatch = async () => {
    gameStates.current = {};
    selectedGameIdRef.current = null;
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

    // PGN path handling
    const appDir = await appDataDir();
    const pgnPath = `${appDir}/tournament.pgn`; // Simplified. Ideally use join.

    const config = {
      mode: tournamentMode, engines: engines, time_control: { base_ms: baseMs, inc_ms: incMs },
      games_count: gamesCount, concurrency: concurrency, swap_sides: swapSides,
      opening_fen: (openingMode === 'fen' && openingFen) ? openingFen : null,
      opening_file: (openingMode === 'file' && openingFile) ? openingFile : null,
      variant: variant,
      pgn_path: pgnPath,
      event_name: eventName
    };
    await invoke("start_match", { config });
    setActiveTab('schedule');
  };

  const stopMatch = async () => { await invoke("stop_match"); setMatchRunning(false); };
  const togglePause = async () => { await invoke("pause_match", { paused: !isPaused }); setIsPaused(!isPaused); };

  const addEngine = () => { setEngines([...engines, { id: crypto.randomUUID(), name: `Engine ${engines.length + 1}`, path: "mock-engine", options: [] }]); };
  const removeEngine = (idx: number) => { if (engines.length > 2) { const n = [...engines]; n.splice(idx, 1); setEngines(n); } };
  const updateEnginePath = (idx: number, path: string) => { const n = [...engines]; n[idx].path = path; setEngines(n); };
  const updateEngineName = (idx: number, name: string) => { const n = [...engines]; n[idx].name = name; setEngines(n); };
  const updateEngineFlag = (idx: number, code: string) => { const n = [...engines]; n[idx].country_code = code; setEngines(n); };

  const updateEngineOption = (engIdx: number, optName: string, optVal: string) => {
      const n = [...engines]; const opts = n[engIdx].options;
      const existing = opts.findIndex(o => o[0] === optName);
      if (existing >= 0) opts[existing][1] = optVal; else opts.push([optName, optVal]);
      setEngines(n);
  };
  const removeEngineOption = (engIdx: number, optName: string) => {
      const n = [...engines]; n[engIdx].options = n[engIdx].options.filter(o => o[0] !== optName);
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

  const handleGameSelect = (id: number) => {
      setSelectedGameId(id); selectedGameIdRef.current = id;
      const state = gameStates.current[id];
      if (state) {
          setFen(state.fen); setMoves([...state.moves]); setLastMove([...state.lastMove]);
          setWhiteEngineIdx(state.whiteEngineIdx); setBlackEngineIdx(state.blackEngineIdx);
          setActiveWhiteStats({...state.activeWhiteStats}); setActiveBlackStats({...state.activeBlackStats});
          setMatchResult(state.matchResult); setEvalHistory([...state.evalHistory]);
      } else { clearGameState(); }
  };

  const copyPgn = async () => {
       let pgn = `[White "${activeWhiteStats.name}"]\n[Black "${activeBlackStats.name}"]\n\n`;
       moves.forEach((m, i) => { if (i % 2 === 0) pgn += `${i/2 + 1}. `; pgn += m + " "; });
       await navigator.clipboard.writeText(pgn);
       alert("PGN copied to clipboard!");
  };

  const savePreset = async () => {
      const preset = {
          tournamentMode, engines: engines.map(e => e.id), gamesCount, concurrency, swapSides,
          openingFen, openingFile, openingMode, variant, eventName,
          timeControl: { baseH, baseM, baseS, incH, incM, incS }
      };
      const path = await save({ filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (path) {
          // Mock save since we need fs plugin.
          // Assuming user might just want to store in app settings for now?
          // For now alert.
          alert("Save preset logic ready, but requires FS access. Data prepared.");
          console.log(JSON.stringify(preset));
      }
  };

  const loadPreset = async () => {
      // Mock load
      const selected = await open({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (selected) {
           alert("Load preset logic ready. Requires FS access to read file content.");
      }
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
    <div className="h-screen w-screen bg-gray-900 text-white flex overflow-hidden text-lg">
      {/* Engine Manager Modal */}
      {showEngineManager && (
          <EngineManager
            engines={engineLibrary}
            onUpdate={(newLib) => setEngineLibrary(newLib)}
            onClose={() => setShowEngineManager(false)}
          />
      )}

      {/* Modal for Engine Options (Existing) */}
      {editingEngineIdx !== null && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
              <div className="bg-gray-800 p-6 rounded-lg w-96 max-h-[80vh] overflow-y-auto border border-gray-600 shadow-2xl">
                  <h2 className="text-xl font-bold mb-4">Edit Engine: {engines[editingEngineIdx].name}</h2>
                  <div className="mb-4">
                      <label className="text-sm font-semibold text-gray-400 block mb-1">Country Flag</label>
                      <select className="bg-gray-700 p-2 rounded w-full text-sm" value={engines[editingEngineIdx].country_code || ""} onChange={(e) => updateEngineFlag(editingEngineIdx, e.target.value)}>
                          <option value="">No Flag</option>
                          {Object.entries(COUNTRIES).map(([code, name]) => ( <option key={code} value={code}>{name}</option> ))}
                      </select>
                  </div>
                  <div className="mb-4">
                      <label className="text-sm font-semibold text-gray-400 block mb-1">UCI Options</label>
                      <div className="flex flex-col gap-2">
                          {engines[editingEngineIdx].options.map(([key, val], i) => (
                              <div key={i} className="flex gap-1 items-center">
                                  <input className="bg-gray-700 p-1 rounded w-1/3 text-xs" value={key} readOnly />
                                  <input className="bg-gray-700 p-1 rounded w-1/3 text-xs" value={val} onChange={(e) => updateEngineOption(editingEngineIdx, key, e.target.value)} />
                                  <button className="text-red-400 hover:text-red-300" onClick={() => removeEngineOption(editingEngineIdx, key)}><Trash2 size={14}/></button>
                              </div>
                          ))}
                      </div>
                      <div className="mt-2 flex gap-1">
                          <input id="newOptName" className="bg-gray-700 p-1 rounded w-1/3 text-xs" placeholder="Name" />
                          <input id="newOptVal" className="bg-gray-700 p-1 rounded w-1/3 text-xs" placeholder="Value" />
                          <button className="bg-green-600 px-2 rounded hover:bg-green-500 text-xs flex items-center" onClick={() => {
                                const nameInput = document.getElementById("newOptName") as HTMLInputElement;
                                const valInput = document.getElementById("newOptVal") as HTMLInputElement;
                                if (nameInput.value && valInput.value) { updateEngineOption(editingEngineIdx, nameInput.value, valInput.value); nameInput.value = ""; valInput.value = ""; }
                            }}><Plus size={14} /></button>
                      </div>
                  </div>
                  <button className="bg-blue-600 px-4 py-2 rounded w-full font-bold hover:bg-blue-500" onClick={() => setEditingEngineIdx(null)}>Close</button>
              </div>
          </div>
      )}

      {/* Sidebar */}
      <div className="w-96 bg-gray-800 flex flex-col border-r border-gray-700 overflow-hidden shrink-0 z-10 relative">
        <div className="p-4 border-b border-gray-700 bg-gray-850 shrink-0">
            <h1 className="text-2xl font-bold text-center text-blue-400 mb-2">CCRL GUI</h1>
            <div className="flex bg-gray-700 rounded p-1">
                <button className={`flex-1 text-sm font-bold py-2 rounded ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`} onClick={() => setActiveTab('settings')}>SETTINGS</button>
                <button className={`flex-1 text-sm font-bold py-2 rounded ${activeTab === 'schedule' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`} onClick={() => setActiveTab('schedule')}>SCHEDULE</button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {activeTab === 'settings' ? (
                <>
                    {/* Presets & DB */}
                    <div className="flex gap-2 mb-2">
                         <button onClick={savePreset} className="flex-1 bg-gray-700 p-2 rounded text-xs flex items-center justify-center gap-1 hover:bg-gray-600"><Save size={14}/> Save Preset</button>
                         <button onClick={loadPreset} className="flex-1 bg-gray-700 p-2 rounded text-xs flex items-center justify-center gap-1 hover:bg-gray-600"><FolderOpen size={14}/> Load Preset</button>
                    </div>
                    <div className="mb-2">
                        <button onClick={() => setShowEngineManager(true)} className="w-full bg-indigo-600 p-2 rounded text-sm font-bold flex items-center justify-center gap-2 hover:bg-indigo-500"><Database size={16}/> Manage Engine Library</button>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-400 uppercase">Tournament Mode</label>
                        <select className="bg-gray-700 p-2 rounded w-full text-sm" value={tournamentMode} onChange={(e) => setTournamentMode(e.target.value as any)}>
                            <option value="Match">Match (1v1)</option>
                            <option value="RoundRobin">Round Robin</option>
                            <option value="Gauntlet">Gauntlet</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                         <label className="text-sm font-semibold text-gray-400 uppercase">Event Name</label>
                         <input className="bg-gray-700 p-2 rounded w-full text-sm" value={eventName} onChange={(e) => setEventName(e.target.value)} />
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-semibold text-gray-400 uppercase">Participants ({engines.length})</label>
                            <button className="bg-green-600 px-2 py-0.5 rounded text-xs hover:bg-green-500" onClick={addEngine}>+ ADD</button>
                        </div>
                        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                            {engines.map((eng, idx) => (
                                <div key={idx} className="bg-gray-700 p-2 rounded flex flex-col gap-1 relative border border-gray-600">
                                    <div className="flex justify-between items-center gap-2">
                                        <div className="flex items-center gap-1 w-full">
                                            {eng.country_code && <img src={`https://flagcdn.com/w20/${eng.country_code}.png`} className="w-4 h-3" />}
                                            <input className="bg-transparent text-sm font-bold border-b border-gray-600 focus:border-blue-500 outline-none w-full" value={eng.name} onChange={(e) => updateEngineName(idx, e.target.value)} />
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
                                    {/* Quick add from library dropdown could go here, but omitted for simplicity */}
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* Time & Options */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-400 uppercase">Time Control</label>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <span className="text-[10px] text-gray-500 block mb-1">Base (H:M:S)</span>
                                <div className="flex gap-1">
                                    <input type="number" className="bg-gray-700 p-1 rounded w-full text-sm text-center" value={baseH} onChange={(e) => setBaseH(parseInt(e.target.value) || 0)} />
                                    <span className="text-gray-500">:</span>
                                    <input type="number" className="bg-gray-700 p-1 rounded w-full text-sm text-center" value={baseM} onChange={(e) => setBaseM(parseInt(e.target.value) || 0)} />
                                    <span className="text-gray-500">:</span>
                                    <input type="number" className="bg-gray-700 p-1 rounded w-full text-sm text-center" value={baseS} onChange={(e) => setBaseS(parseFloat(e.target.value) || 0)} />
                                </div>
                            </div>
                            <div>
                                <span className="text-[10px] text-gray-500 block mb-1">Inc (H:M:S)</span>
                                <div className="flex gap-1">
                                    <input type="number" className="bg-gray-700 p-1 rounded w-full text-sm text-center" value={incH} onChange={(e) => setIncH(parseInt(e.target.value) || 0)} />
                                    <span className="text-gray-500">:</span>
                                    <input type="number" className="bg-gray-700 p-1 rounded w-full text-sm text-center" value={incM} onChange={(e) => setIncM(parseInt(e.target.value) || 0)} />
                                    <span className="text-gray-500">:</span>
                                    <input type="number" className="bg-gray-700 p-1 rounded w-full text-sm text-center" value={incS} onChange={(e) => setIncS(parseFloat(e.target.value) || 0)} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-400 uppercase">Opening</label>
                        <div className="flex justify-between items-center mb-1">
                            <div className="flex bg-gray-700 rounded p-0.5">
                                <button className={`px-2 py-0.5 text-[10px] rounded ${openingMode === 'fen' ? 'bg-blue-600 text-white' : 'text-gray-400'}`} onClick={() => setOpeningMode('fen')}>FEN</button>
                                <button className={`px-2 py-0.5 text-[10px] rounded ${openingMode === 'file' ? 'bg-blue-600 text-white' : 'text-gray-400'}`} onClick={() => setOpeningMode('file')}>FILE</button>
                            </div>
                        </div>
                        {openingMode === 'fen' ? (
                            <input className="bg-gray-700 p-2 rounded w-full text-sm" placeholder="FEN..." value={openingFen} onChange={(e) => setOpeningFen(e.target.value)} />
                        ) : (
                            <div className="flex gap-2">
                                <input className="bg-gray-700 p-2 rounded w-full text-sm" placeholder="Select file..." value={openingFile} readOnly />
                                <button className="bg-blue-600 px-3 py-1 rounded hover:bg-blue-500" onClick={selectOpeningFile}>...</button>
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-2"><input type="checkbox" checked={swapSides} onChange={(e) => setSwapSides(e.target.checked)} /><span className="text-sm">Swap Sides</span></div>
                        <div className="flex items-center gap-2"><span className="text-sm">Games:</span><input type="number" className="bg-gray-700 p-1 rounded w-16 text-sm" value={gamesCount} onChange={(e) => setGamesCount(parseInt(e.target.value))} /></div>
                    </div>
                </>
            ) : (
                <div className="space-y-2">
                    <div className="flex justify-between items-center mb-2"><label className="text-sm font-semibold text-gray-400 uppercase">Upcoming Games</label><span className="text-xs text-gray-500">{schedule.length} Total</span></div>
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
             {!matchRunning ? <button className="bg-green-600 p-3 rounded font-bold hover:bg-green-500 w-full flex items-center justify-center gap-2" onClick={startMatch}><Play size={20}/> START</button> : <button className="bg-red-600 p-3 rounded font-bold hover:bg-red-500 w-full" onClick={stopMatch}>STOP</button>}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-4 gap-4 bg-gray-900 overflow-hidden">
        {/* Top Area: Board & Scoreboard - Expanded */}
        <div className="grid grid-cols-3 gap-4 h-[70vh] min-h-0">
          <div className="bg-gray-800 rounded-lg p-4 flex flex-col gap-2 border border-gray-700 shadow-lg overflow-hidden">
             <EnginePanel stats={activeWhiteStats} side="white" />
             <div className="flex-1 min-h-0 flex gap-2"><PvBoard pv={activeWhiteStats.pv} currentFen={fen} side="white" /><div className="flex-1 bg-gray-900 rounded border border-gray-700 p-2 overflow-y-auto font-mono text-sm text-green-400"><div>[{activeWhiteStats.name}] readyok</div></div></div>
          </div>

          {/* Board & Scoreboard */}
          <div className="flex flex-col gap-2 items-center justify-center bg-gray-800 rounded-lg p-4 border border-gray-700 shadow-lg relative">
             <div className="text-4xl font-bold text-gray-200 mb-4 flex flex-col items-center">
               {matchResult ? <span className="text-yellow-400">{matchResult}</span> : <span>{tournamentStats ? `${tournamentStats.wins} - ${tournamentStats.losses} - ${tournamentStats.draws}` : "0 - 0 - 0"}</span>}
               {tournamentStats && <span className="text-lg text-blue-400 mt-1">{tournamentStats.sprt_status}</span>}
             </div>

             <div className="w-full flex justify-between items-end px-8 mb-2"><span className="text-gray-400 font-mono text-sm">BLACK</span><div className="flex items-center gap-2"><Flag code={activeBlackStats.country_code} /><span className="text-white font-bold text-2xl">{activeBlackStats.name}</span></div><span className="text-gray-400 font-mono text-sm">{activeBlackStats.score ? (activeBlackStats.score / 100).toFixed(2) : "0.00"}</span></div>
             <div className="w-full aspect-square max-h-[50vh]">
                 <Board fen={fen} lastMove={lastMove} config={{ movable: { viewOnly: true }, drawable: { visible: true } }} shapes={pvShapes} />
             </div>
             <div className="w-full flex justify-between items-start px-8 mt-2"><span className="text-gray-400 font-mono text-sm">WHITE</span><div className="flex items-center gap-2"><Flag code={activeWhiteStats.country_code} /><span className="text-white font-bold text-2xl">{activeWhiteStats.name}</span></div><span className="text-gray-400 font-mono text-sm">{activeWhiteStats.score ? (activeWhiteStats.score / 100).toFixed(2) : "0.00"}</span></div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4 flex flex-col gap-2 border border-gray-700 shadow-lg overflow-hidden">
             <EnginePanel stats={activeBlackStats} side="black" />
             <div className="flex-1 min-h-0 flex gap-2"><PvBoard pv={activeBlackStats.pv} currentFen={fen} side="black" /><div className="flex-1 bg-gray-900 rounded border border-gray-700 p-2 overflow-y-auto font-mono text-sm text-blue-400"><div>[{activeBlackStats.name}] readyok</div></div></div>
          </div>
        </div>

        {/* Bottom Area: Eval & Moves - Shrinked */}
        <div className="flex-1 grid grid-cols-3 gap-4 shrink-0 min-h-0">
           <div className="col-span-2 bg-gray-800 rounded-lg border border-gray-700 p-2 flex flex-col"><h3 className="text-sm font-bold text-gray-400 mb-1 ml-2">Evaluation History</h3><div className="flex-1 w-full h-full"><EvalGraph data={evalHistory} /></div></div>
           <div className="bg-gray-800 rounded-lg border border-gray-700 p-2 flex flex-col"><div className="flex justify-between items-center mb-1 mx-2"><h3 className="text-sm font-bold text-gray-400">Move List</h3><button onClick={copyPgn} className="text-xs bg-gray-700 px-2 py-0.5 rounded hover:bg-gray-600 text-blue-300">COPY PGN</button></div><div className="flex-1 overflow-y-auto"><MoveList moves={moves} /></div></div>
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
