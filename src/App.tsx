import { useState, useEffect, useMemo, useRef } from "react";
import { Board } from "./components/Board";
import { EnginePanel } from "./components/EnginePanel";
import { PvBoard } from "./components/PvBoard";
import { EvalGraph } from "./components/EvalGraph";
import { MoveList } from "./components/MoveList";
import { Flag } from "./components/Flag";
import EngineManager from "./components/EngineManager";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
import { open as openPath } from "@tauri-apps/plugin-opener";
import { appDataDir, join } from "@tauri-apps/api/path";
import { Cog, Plus, Trash2, FolderOpen, Save, Database, Play, ChevronDown, ChevronRight } from 'lucide-react';

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

interface TournamentDraft {
  tournamentMode: "Match" | "RoundRobin" | "Gauntlet";
  engines: EngineConfig[];
  gamesCount: number;
  concurrency: number;
  swapSides: boolean;
  openingFen: string;
  openingFile: string;
  openingMode: "fen" | "file";
  variant: string;
  eventName: string;
  timeControl: { baseH: number; baseM: number; baseS: number; incH: number; incM: number; incS: number };
  savedAt: string;
}

interface ScheduledGame {
  id: number;
  white_name: string;
  black_name: string;
  state: string;
  result: string | null;
}

interface TournamentConfig {
  mode: "Match" | "RoundRobin" | "Gauntlet";
  engines: EngineConfig[];
  time_control: { base_ms: number; inc_ms: number };
  games_count: number;
  swap_sides: boolean;
  opening_fen?: string | null;
  opening_file?: string | null;
  opening_order?: string | null;
  variant: string;
  concurrency?: number | null;
  pgn_path?: string | null;
  event_name?: string | null;
  resume_state_path?: string | null;
  resume_from_state?: boolean;
}

interface TournamentResumeState {
  config: TournamentConfig;
  schedule: ScheduledGame[];
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
  const [disabledEngineIds, setDisabledEngineIds] = useState<string[]>([]);
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
  const [openingOrder, setOpeningOrder] = useState<'sequential' | 'random'>('sequential');
  const [variant, setVariant] = useState("standard");
  const [eventName, setEventName] = useState("CCRL GUI Tournament");
  const [remainingRounds, setRemainingRounds] = useState(0);
  const [pgnPath, setPgnPath] = useState("");
  const [defaultPgnPath, setDefaultPgnPath] = useState<string | null>(null);
  const [resolvedPgnPath, setResolvedPgnPath] = useState<string | null>(null);

  const [baseH, setBaseH] = useState(0);
  const [baseM, setBaseM] = useState(1);
  const [baseS, setBaseS] = useState(0);
  const [incH, setIncH] = useState(0);
  const [incM, setIncM] = useState(0);
  const [incS, setIncS] = useState(1);

  const [isPaused, setIsPaused] = useState(false);
  const [matchRunning, setMatchRunning] = useState(false);
  const [store, setStore] = useState<any>(null);
  const [draftRestoredAt, setDraftRestoredAt] = useState<string | null>(null);
  const [activeTournamentConfig, setActiveTournamentConfig] = useState<any>(null);

  const [activeTab, setActiveTab] = useState<'settings' | 'schedule'>('settings');
  const [schedule, setSchedule] = useState<ScheduledGame[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [savedTournament, setSavedTournament] = useState<TournamentResumeState | null>(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);

  const selectedGameIdRef = useRef<number | null>(null);
  const gameStates = useRef<Record<number, GameStateData>>({});

  const [tournamentStats, setTournamentStats] = useState<any>(null);
  const [editingEngineIdx, setEditingEngineIdx] = useState<number | null>(null);
  const [selectedEngineIdx, setSelectedEngineIdx] = useState(0);

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
    const normalizeEngines = (list: EngineConfig[], namePrefix: string) => (
      list.map((engine, idx) => ({
        id: engine.id ?? crypto.randomUUID(),
        name: engine.name ?? `${namePrefix} ${idx + 1}`,
        path: engine.path ?? "",
        options: Array.isArray(engine.options) ? engine.options : [],
        country_code: engine.country_code,
        args: Array.isArray(engine.args) ? engine.args : [],
        working_directory: engine.working_directory ?? "",
        protocol: engine.protocol
      }))
    );

    const initStore = async () => {
      const s = await load('settings.json');
      setStore(s);
      const savedEngines = await s.get("active_engines");
      const savedLibrary = await s.get("engine_library");
      const savedDraft = await s.get("tournament_draft");
      const savedActiveTournament = await s.get("active_tournament");
      if (savedEngines) setEngines(savedEngines as EngineConfig[]);
      if (savedLibrary) setEngineLibrary(savedLibrary as EngineConfig[]);
      if (savedDraft) {
        const draft = savedDraft as TournamentDraft;
        setTournamentMode(draft.tournamentMode ?? "Match");
        setGamesCount(draft.gamesCount ?? 10);
        setConcurrency(draft.concurrency ?? 4);
        setSwapSides(draft.swapSides ?? true);
        setOpeningFen(draft.openingFen ?? "");
        setOpeningFile(draft.openingFile ?? "");
        setOpeningMode(draft.openingMode ?? "fen");
        setVariant(draft.variant ?? "standard");
        setEventName(draft.eventName ?? "CCRL GUI Tournament");
        if (draft.engines?.length) setEngines(draft.engines);
        if (draft.timeControl) {
          setBaseH(draft.timeControl.baseH ?? 0);
          setBaseM(draft.timeControl.baseM ?? 1);
          setBaseS(draft.timeControl.baseS ?? 0);
          setIncH(draft.timeControl.incH ?? 0);
          setIncM(draft.timeControl.incM ?? 0);
          setIncS(draft.timeControl.incS ?? 1);
        }
        setDraftRestoredAt(draft.savedAt ?? new Date().toISOString());
      }
      if (savedActiveTournament) setActiveTournamentConfig(savedActiveTournament);
      if (savedEngines) {
        setEngines(normalizeEngines(savedEngines as EngineConfig[], "Engine"));
      }
      if (savedLibrary) {
        setEngineLibrary(normalizeEngines(savedLibrary as EngineConfig[], "Library Engine"));
      }
    };
    initStore();
  }, []);

  useEffect(() => {
    const checkSavedTournament = async () => {
      try {
        const saved = await invoke<TournamentResumeState | null>("get_saved_tournament");
        if (saved) {
          setSavedTournament(saved);
          setShowResumePrompt(true);
        }
      } catch (err) {
        console.warn("Failed to load saved tournament", err);
      }
    };
    checkSavedTournament();
  }, []);

  const resolveDefaultPgnPath = async () => {
    try {
      const appDir = await appDataDir();
      const defaultPath = await join(appDir, "tournament.pgn");
      setDefaultPgnPath(defaultPath);
      return defaultPath;
    } catch (err) {
      console.warn("Failed to resolve default PGN path", err);
      return null;
    }
  };

  useEffect(() => {
    resolveDefaultPgnPath();
  }, []);

  useEffect(() => {
    if (!store) return;
    store.set("active_engines", engines);
    store.set("engine_library", engineLibrary);
    store.save();
  }, [engines, engineLibrary, store]);

  useEffect(() => {
    if (!matchRunning) {
      setRemainingRounds(gamesCount);
    }
  }, [gamesCount, matchRunning]);

  useEffect(() => {
    if (!store) return;
    const draft: TournamentDraft = {
      tournamentMode,
      engines,
      gamesCount,
      concurrency,
      swapSides,
      openingFen,
      openingFile,
      openingMode,
      variant,
      eventName,
      timeControl: { baseH, baseM, baseS, incH, incM, incS },
      savedAt: new Date().toISOString()
    };
    store.set("tournament_draft", draft);
    store.save();
  }, [
    tournamentMode,
    engines,
    gamesCount,
    concurrency,
    swapSides,
    openingFen,
    openingFile,
    openingMode,
    variant,
    eventName,
    baseH,
    baseM,
    baseS,
    incH,
    incM,
    incS,
    store
  ]);

  useEffect(() => {
    if (selectedEngineIdx >= engines.length) {
      setSelectedEngineIdx(Math.max(0, engines.length - 1));
    }
  }, [engines.length, selectedEngineIdx]);

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
        if (update.state === "Removed") {
            setSchedule(prev => prev.filter(game => game.id !== update.id));
            if (selectedGameIdRef.current === update.id) {
                selectedGameIdRef.current = null;
                setSelectedGameId(null);
                clearGameState();
            }
            return;
        }
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

  const applyTournamentConfig = (config: TournamentConfig) => {
    setTournamentMode(config.mode);
    setEngines(config.engines);
    setGamesCount(config.games_count);
    setConcurrency(config.concurrency ?? 4);
    setSwapSides(config.swap_sides);
    setVariant(config.variant);
    setEventName(config.event_name ?? "CCRL GUI Tournament");
    const baseMs = config.time_control.base_ms;
    const incMs = config.time_control.inc_ms;
    const baseTotalSeconds = Math.floor(baseMs / 1000);
    const incTotalSeconds = Math.floor(incMs / 1000);
    setBaseH(Math.floor(baseTotalSeconds / 3600));
    setBaseM(Math.floor((baseTotalSeconds % 3600) / 60));
    setBaseS(baseTotalSeconds % 60);
    setIncH(Math.floor(incTotalSeconds / 3600));
    setIncM(Math.floor((incTotalSeconds % 3600) / 60));
    setIncS(incTotalSeconds % 60);
    const openingFenValue = config.opening_fen ?? "";
    const openingFileValue = config.opening_file ?? "";
    setOpeningFen(openingFenValue);
    setOpeningFile(openingFileValue);
    const nextOpeningMode = openingFenValue ? "fen" : (openingFileValue ? "file" : "fen");
    setOpeningMode(nextOpeningMode);
  };

  const startMatch = async () => {
    gameStates.current = {};
    selectedGameIdRef.current = null;
    clearGameState();
    setMatchRunning(true);
    setIsPaused(false);
    setSchedule([]);
    setSelectedGameId(null);
    setRemainingRounds(gamesCount);
    if (engines.length >= 2) {
       setActiveWhiteStats(prev => ({ ...prev, name: engines[0].name, country_code: engines[0].country_code || "" }));
       setActiveBlackStats(prev => ({ ...prev, name: engines[1].name, country_code: engines[1].country_code || "" }));
    }
    const baseMs = Math.round((baseH * 3600 + baseM * 60 + baseS) * 1000);
    const incMs = Math.round((incH * 3600 + incM * 60 + incS) * 1000);

    // PGN path handling
    const appDir = await appDataDir();
    const resolvedDefaultPgnPath = defaultPgnPath ?? await resolveDefaultPgnPath();
    const pgnPath = resolvedDefaultPgnPath ?? await join(appDir, "tournament.pgn");
    const resumeStatePath = await join(appDir, "tournament_resume.json");

    const config: TournamentConfig = {
      mode: tournamentMode, engines: engines, time_control: { base_ms: baseMs, inc_ms: incMs },
      games_count: gamesCount, concurrency: concurrency, swap_sides: swapSides,
      opening_fen: (openingMode === 'fen' && openingFen) ? openingFen : null,
      opening_file: (openingMode === 'file' && openingFile) ? openingFile : null,
      opening_order: (openingMode === 'file' && openingFile) ? openingOrder : null,
      variant: variant,
      pgn_path: pgnPath,
      event_name: eventName,
      disabled_engine_ids: disabledEngineIds,
      resume_state_path: resumeStatePath,
      resume_from_state: false
    };
    setActiveTournamentConfig(config);
    if (store) {
      store.set("active_tournament", config);
      store.save();
    }
    await invoke("start_match", { config });
    setActiveTab('schedule');
  };

  const stopMatch = async () => {
    await invoke("stop_match");
    setMatchRunning(false);
    setActiveTournamentConfig(null);
    if (store) {
      await store.delete("active_tournament");
      store.save();
    }
  };
  const resumeMatch = async () => {
    if (!savedTournament) return;
    gameStates.current = {};
    selectedGameIdRef.current = null;
    clearGameState();
    applyTournamentConfig(savedTournament.config);
    setSchedule(savedTournament.schedule);
    setMatchRunning(true);
    setIsPaused(false);
    setSelectedGameId(null);
    setShowResumePrompt(false);
    await invoke("resume_match");
    setActiveTab('schedule');
  };

  const discardSavedTournament = async () => {
    await invoke("discard_saved_tournament");
    setSavedTournament(null);
    setShowResumePrompt(false);
  };

  const togglePause = async () => { await invoke("pause_match", { paused: !isPaused }); setIsPaused(!isPaused); };
  const updateRemainingRounds = async () => {
    const value = Math.max(0, Math.floor(remainingRounds));
    setRemainingRounds(value);
    if (matchRunning) {
      await invoke("update_remaining_rounds", { remaining_rounds: value });
    }
  };
  const toggleEngineDisabled = async (engineId?: string) => {
    if (!engineId) return;
    const nextIds = disabledEngineIds.includes(engineId)
      ? disabledEngineIds.filter(id => id !== engineId)
      : [...disabledEngineIds, engineId];
    setDisabledEngineIds(nextIds);
    if (matchRunning) {
      await invoke("set_disabled_engines", { disabled_engine_ids: nextIds });
    }
  };

  const removeEngine = (idx: number) => {
    if (engines.length > 2) {
      const removedId = engines[idx].id;
      const n = [...engines];
      n.splice(idx, 1);
      setEngines(n);
      if (removedId) setDisabledEngineIds(prev => prev.filter(id => id !== removedId));
    }
  };
  const addEngine = () => {
    setEngines([
      ...engines,
      {
        id: crypto.randomUUID(),
        name: `Engine ${engines.length + 1}`,
        path: "mock-engine",
        options: [],
        args: [],
        working_directory: ""
      }
    ]);
  };
  const updateEnginePath = (idx: number, path: string) => { const n = [...engines]; n[idx].path = path; setEngines(n); };
  const updateEngineName = (idx: number, name: string) => { const n = [...engines]; n[idx].name = name; setEngines(n); };
  const updateEngineFlag = (idx: number, code: string) => { const n = [...engines]; n[idx].country_code = code; setEngines(n); };
  const updateEngineWorkingDirectory = (idx: number, workingDirectory: string) => {
    const n = [...engines];
    n[idx].working_directory = workingDirectory;
    setEngines(n);
  };

  const updateEngineArgs = (idx: number, args: string[]) => {
    const n = [...engines];
    n[idx].args = args;
    setEngines(n);
  };

  const updateEngineOption = (engIdx: number, optName: string, optVal: string) => {
      const n = [...engines]; const opts = n[engIdx].options;
      const existing = opts.findIndex(o => o[0] === optName);
      if (existing >= 0) opts[existing][1] = optVal; else opts.push([optName, optVal]);
      setEngines(n);
  };
  const updateEngineOptionAt = (engIdx: number, optIdx: number, key: string, val: string) => {
      const n = [...engines];
      n[engIdx].options[optIdx] = [key, val];
      setEngines(n);
  };
  const removeEngineOption = (engIdx: number, optName: string) => {
      const n = [...engines]; n[engIdx].options = n[engIdx].options.filter(o => o[0] !== optName);
      setEngines(n);
  };
  const removeEngineOptionAt = (engIdx: number, optIdx: number) => {
      const n = [...engines];
      n[engIdx].options.splice(optIdx, 1);
      setEngines(n);
  };

  const selectFileForEngine = async (idx: number) => {
    const selected = await openDialog({ multiple: false, filters: [{ name: 'Executables', extensions: ['exe', ''] }] });
    if (selected && typeof selected === 'string') updateEnginePath(idx, selected);
  };
  const selectOpeningFile = async () => {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: 'Openings', extensions: ['epd', 'pgn', 'fen', 'txt'] }]
    });
    if (selected && typeof selected === 'string') setOpeningFile(selected);
  };
  const selectPgnPath = async () => {
    const selected = await save({ filters: [{ name: 'PGN', extensions: ['pgn'] }] });
    if (selected) setPgnPath(selected);
  };
  const revealPgnPath = async () => {
    const target = pgnPath.trim() || resolvedPgnPath || defaultPgnPath;
    if (target) await openPath(target);
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
          openingFen, openingFile, openingMode, openingOrder, variant, eventName,
          timeControl: { baseH, baseM, baseS, incH, incM, incS }
      };
      const path = await save({ filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (path) {
          alert("Save preset logic ready, but requires FS access. Data prepared.");
          console.log(JSON.stringify(preset));
      }
  };

  const loadPreset = async () => {
      const selected = await openDialog({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] });
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
      {showResumePrompt && savedTournament && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
          <div className="bg-gray-800 p-6 rounded-lg w-96 border border-gray-600 shadow-2xl">
            <h2 className="text-xl font-bold mb-2 text-blue-300">Resume Tournament?</h2>
            <p className="text-sm text-gray-300 mb-4">An in-progress tournament was found. Would you like to resume or discard it?</p>
            <div className="flex gap-2">
              <button className="flex-1 bg-green-600 px-4 py-2 rounded font-bold hover:bg-green-500" onClick={resumeMatch}>Resume</button>
              <button className="flex-1 bg-red-600 px-4 py-2 rounded font-bold hover:bg-red-500" onClick={discardSavedTournament}>Discard</button>
            </div>
          </div>
        </div>
      )}
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
        <div className="p-4 border-b border-gray-700 bg-gray-900 shrink-0">
            <h1 className="text-2xl font-bold text-center text-blue-400 mb-2">CCRL GUI</h1>
            <div className="flex bg-gray-700 rounded p-1">
                <button className={`flex-1 text-sm font-bold py-2 rounded ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`} onClick={() => setActiveTab('settings')}>SETTINGS</button>
                <button className={`flex-1 text-sm font-bold py-2 rounded ${activeTab === 'schedule' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`} onClick={() => setActiveTab('schedule')}>SCHEDULE</button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {activeTab === 'settings' ? (
                <>
                    {draftRestoredAt && (
                        <div className="rounded border border-blue-600 bg-blue-900/40 px-3 py-2 text-xs text-blue-100">
                            <span className="font-semibold">Draft restored:</span> Last saved {new Date(draftRestoredAt).toLocaleString()}.
                        </div>
                    )}
                    {matchRunning && (
                        <div className="rounded border border-amber-500/70 bg-amber-900/30 px-3 py-2 text-xs text-amber-100">
                            <span className="font-semibold">Active tournament:</span> Changes here are saved as a draft and won’t affect the running event.
                        </div>
                    )}
                    {!matchRunning && activeTournamentConfig && (
                        <div className="rounded border border-gray-600 bg-gray-800/70 px-3 py-2 text-xs text-gray-200">
                            <span className="font-semibold">Active tournament stored:</span> Draft edits stay separate until a new event starts.
                        </div>
                    )}
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
                        <label className="text-sm font-semibold text-gray-400 uppercase">PGN Save Path</label>
                        <div className="flex gap-2">
                            <input className="bg-gray-700 p-2 rounded w-full text-sm" placeholder="Use default tournament.pgn" value={pgnPath} onChange={(e) => setPgnPath(e.target.value)} />
                            <button className="bg-blue-600 px-3 py-1 rounded hover:bg-blue-500 text-xs" onClick={selectPgnPath}>Browse</button>
                            <button className="bg-gray-700 px-3 py-1 rounded hover:bg-gray-600 text-xs" onClick={revealPgnPath} disabled={!pgnPath.trim() && !defaultPgnPath && !resolvedPgnPath}>Reveal in File Explorer</button>
                        </div>
                        <p className="text-xs text-gray-500">
                            Default: {defaultPgnPath || "tournament.pgn"}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-semibold text-gray-400 uppercase">Participants ({engines.length})</label>
                            <button className="bg-green-600 px-2 py-0.5 rounded text-xs hover:bg-green-500" onClick={addEngine}>+ ADD</button>
                        </div>
                        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                            {engines.map((eng, idx) => (
                                <div
                                  key={idx}
                                  className={`bg-gray-700 p-2 rounded flex flex-col gap-1 relative border ${selectedEngineIdx === idx ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-600'}`}
                                  onClick={() => setSelectedEngineIdx(idx)}
                                >
                                    <div className="flex justify-between items-center gap-2">
                                        <div className="flex items-center gap-1 w-full">
                                            <Flag code={eng.country_code} />
                                            <input className="bg-transparent text-sm font-bold border-b border-gray-600 focus:border-blue-500 outline-none w-full" value={eng.name} onChange={(e) => updateEngineName(idx, e.target.value)} />
                                        </div>
                                        <div className="flex gap-1">
                                            <button className="text-gray-400 hover:text-white" onClick={() => setEditingEngineIdx(idx)}><Cog size={14}/></button>
                                            {engines.length > 2 && <button className="text-red-400 text-xs hover:text-red-300" onClick={() => removeEngine(idx)}><Trash2 size={14}/></button>}
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <input className="bg-gray-600 p-1 rounded w-full text-xs" value={eng.path} onChange={(e) => updateEnginePath(idx, e.target.value)} title={eng.path} />
                                        <button className="bg-blue-600 px-2 rounded hover:bg-blue-500 text-xs flex items-center justify-center" onClick={() => selectFileForEngine(idx)}><FolderOpen size={10} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-400 uppercase">Engine Settings</label>
                        <select
                          className="bg-gray-700 p-2 rounded w-full text-sm"
                          value={selectedEngineIdx}
                          onChange={(e) => setSelectedEngineIdx(parseInt(e.target.value, 10))}
                        >
                          {engines.map((eng, idx) => (
                            <option key={eng.id ?? idx} value={idx}>{eng.name}</option>
                          ))}
                        </select>
                        {engines[selectedEngineIdx] && (
                          <div className="bg-gray-800 border border-gray-700 rounded p-3 space-y-3">
                            <div className="space-y-1">
                              <label className="text-xs uppercase text-gray-400">Working Directory</label>
                              <input
                                className="bg-gray-700 p-2 rounded w-full text-xs"
                                placeholder="Working Directory"
                                value={engines[selectedEngineIdx].working_directory || ""}
                                onChange={(e) => updateEngineWorkingDirectory(selectedEngineIdx, e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <label className="text-xs uppercase text-gray-400">Args</label>
                                <button
                                  className="bg-green-600 px-2 py-0.5 rounded text-xs hover:bg-green-500"
                                  onClick={() => updateEngineArgs(selectedEngineIdx, [...(engines[selectedEngineIdx].args || []), ""])}
                                >
                                  + Add Arg
                                </button>
                              </div>
                              <div className="flex flex-col gap-2">
                                {(engines[selectedEngineIdx].args || []).map((arg, argIdx) => (
                                  <div key={`${selectedEngineIdx}-arg-${argIdx}`} className="flex gap-2 items-center">
                                    <input
                                      className="bg-gray-700 p-2 rounded w-full text-xs"
                                      placeholder="Argument"
                                      value={arg}
                                      onChange={(e) => {
                                        const nextArgs = [...(engines[selectedEngineIdx].args || [])];
                                        nextArgs[argIdx] = e.target.value;
                                        updateEngineArgs(selectedEngineIdx, nextArgs);
                                      }}
                                    />
                                    <button
                                      className="text-red-400 hover:text-red-300"
                                      onClick={() => {
                                        const nextArgs = [...(engines[selectedEngineIdx].args || [])];
                                        nextArgs.splice(argIdx, 1);
                                        updateEngineArgs(selectedEngineIdx, nextArgs);
                                      }}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                ))}
                                {(engines[selectedEngineIdx].args || []).length === 0 && (
                                  <div className="text-xs text-gray-500">No args configured.</div>
                                )}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <label className="text-xs uppercase text-gray-400">UCI Options</label>
                                <button
                                  className="bg-green-600 px-2 py-0.5 rounded text-xs hover:bg-green-500"
                                  onClick={() => updateEngineOptionAt(selectedEngineIdx, engines[selectedEngineIdx].options.length, "", "")}
                                >
                                  + Add Option
                                </button>
                              </div>
                              <div className="flex flex-col gap-2">
                                {engines[selectedEngineIdx].options.map(([key, val], optIdx) => (
                                  <div key={`${selectedEngineIdx}-opt-${optIdx}`} className="flex gap-2 items-center">
                                    <input
                                      className="bg-gray-700 p-2 rounded w-1/2 text-xs"
                                      placeholder="Name"
                                      value={key}
                                      onChange={(e) => updateEngineOptionAt(selectedEngineIdx, optIdx, e.target.value, val)}
                                    />
                                    <input
                                      className="bg-gray-700 p-2 rounded w-1/2 text-xs"
                                      placeholder="Value"
                                      value={val}
                                      onChange={(e) => updateEngineOptionAt(selectedEngineIdx, optIdx, key, e.target.value)}
                                    />
                                    <button
                                      className="text-red-400 hover:text-red-300"
                                      onClick={() => removeEngineOptionAt(selectedEngineIdx, optIdx)}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                ))}
                                {engines[selectedEngineIdx].options.length === 0 && (
                                  <div className="text-xs text-gray-500">No options configured.</div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                    </div>
                    {/* Time & Options */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-400 uppercase">Time Control</label>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <span className="text-sm text-gray-500 block mb-1">Base (H:M:S)</span>
                                <div className="flex gap-1">
                                    <input type="number" className="bg-gray-700 p-1 rounded w-full text-sm text-center" value={baseH} onChange={(e) => setBaseH(parseInt(e.target.value) || 0)} />
                                    <span className="text-gray-500">:</span>
                                    <input type="number" className="bg-gray-700 p-1 rounded w-full text-sm text-center" value={baseM} onChange={(e) => setBaseM(parseInt(e.target.value) || 0)} />
                                    <span className="text-gray-500">:</span>
                                    <input type="number" className="bg-gray-700 p-1 rounded w-full text-sm text-center" value={baseS} onChange={(e) => setBaseS(parseFloat(e.target.value) || 0)} />
                                </div>
                            </div>
                            <div>
                                <span className="text-sm text-gray-500 block mb-1">Inc (H:M:S)</span>
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
                                <button className={`px-2 py-0.5 text-xs rounded ${openingMode === 'fen' ? 'bg-blue-600 text-white' : 'text-gray-400'}`} onClick={() => setOpeningMode('fen')}>FEN</button>
                                <button className={`px-2 py-0.5 text-xs rounded ${openingMode === 'file' ? 'bg-blue-600 text-white' : 'text-gray-400'}`} onClick={() => setOpeningMode('file')}>FILE</button>
                            </div>
                        </div>
                        {openingMode === 'fen' ? (
                            <input className="bg-gray-700 p-2 rounded w-full text-sm" placeholder="FEN..." value={openingFen} onChange={(e) => setOpeningFen(e.target.value)} />
                        ) : (
                            <div className="flex flex-col gap-2">
                                <div className="flex gap-2">
                                    <input className="bg-gray-700 p-2 rounded w-full text-sm" placeholder="Select file..." value={openingFile} readOnly />
                                    <button className="bg-blue-600 px-3 py-1 rounded hover:bg-blue-500" onClick={selectOpeningFile}>...</button>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="text-gray-500">Order</span>
                                    <select
                                        className="bg-gray-700 p-1 rounded text-sm"
                                        value={openingOrder}
                                        onChange={(e) => setOpeningOrder(e.target.value as 'sequential' | 'random')}
                                    >
                                        <option value="sequential">Sequential</option>
                                        <option value="random">Random</option>
                                    </select>
                                </div>
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
                    {matchRunning && (
                        <div className="bg-gray-800/70 border border-gray-700 rounded p-2 flex flex-col gap-2">
                            <label className="text-sm font-semibold text-gray-400 uppercase">Remaining Rounds</label>
                            <div className="flex gap-2 items-center">
                                <input
                                    type="number"
                                    min={0}
                                    className="bg-gray-700 p-1 rounded w-24 text-sm text-center"
                                    value={remainingRounds}
                                    onChange={(e) => setRemainingRounds(parseInt(e.target.value) || 0)}
                                />
                                <button
                                    className="bg-blue-600 px-3 py-1 rounded text-xs font-bold hover:bg-blue-500"
                                    onClick={updateRemainingRounds}
                                >
                                    Update
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="bg-gray-800/60 border border-gray-700 rounded p-2">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-semibold text-gray-400 uppercase">Engine Toggles</label>
                            <span className="text-xs text-gray-500">{disabledEngineIds.length} Disabled</span>
                        </div>
                        <div className="flex flex-col gap-2">
                            {engines.map((eng) => {
                                const isDisabled = !!eng.id && disabledEngineIds.includes(eng.id);
                                const isToggleDisabled = !eng.id;
                                return (
                                    <div key={eng.id || eng.name} className={`flex items-center justify-between gap-2 rounded px-2 py-1 border ${isDisabled ? "border-red-500/50 bg-red-900/20" : "border-gray-700 bg-gray-700/40"}`}>
                                        <span className="text-xs font-semibold">{eng.name}</span>
                                        <button
                                            className={`text-xs px-2 py-0.5 rounded ${isToggleDisabled ? "bg-gray-600 text-gray-400 cursor-not-allowed" : isDisabled ? "bg-red-600 hover:bg-red-500" : "bg-green-600 hover:bg-green-500"}`}
                                            onClick={() => toggleEngineDisabled(eng.id)}
                                            disabled={isToggleDisabled}
                                        >
                                            {isDisabled ? "Disabled" : "Enabled"}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
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
        <div className="p-4 border-t border-gray-700 bg-gray-900 shrink-0">
             {matchRunning && resolvedPgnPath && (
                 <div className="mb-2 text-xs text-gray-400 break-all">
                     PGN output: <span className="text-gray-200">{resolvedPgnPath}</span>
                 </div>
             )}
             {!matchRunning ? <button className="bg-green-600 p-3 rounded font-bold hover:bg-green-500 w-full flex items-center justify-center gap-2" onClick={startMatch}><Play size={20}/> START</button> : <button className="bg-red-600 p-3 rounded font-bold hover:bg-red-500 w-full" onClick={stopMatch}>STOP</button>}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-4 gap-4 bg-gray-900 overflow-hidden">
        {/* Top Area: Board & Scoreboard - Expanded */}
        <div className="grid grid-cols-3 gap-4 h-[70vh] min-h-0">
          <div className="bg-gray-800 rounded-lg p-4 flex flex-col gap-2 border border-gray-700 shadow-lg overflow-hidden">
             <EnginePanel stats={activeWhiteStats} side="white" />
             <div className="flex-1 min-h-0 flex gap-2">
                 <PvBoard pv={activeWhiteStats.pv} currentFen={fen} side="white" />
                 <div className={`flex flex-col bg-gray-900 rounded border border-gray-700 overflow-hidden transition-all duration-300 h-full ${logsExpanded ? "flex-1 min-w-[12rem]" : "w-48"}`}>
                     <div className="flex justify-between items-center bg-gray-800 px-2 py-1 cursor-pointer hover:bg-gray-700" onClick={() => setLogsExpanded(!logsExpanded)}>
                        <span className="text-sm uppercase font-bold text-gray-500">Engine Log</span>
                        {logsExpanded ? <ChevronDown size={12} className="text-gray-400"/> : <ChevronRight size={12} className="text-gray-400"/>}
                     </div>
                     <div className="flex-1 p-2 overflow-y-auto font-mono text-xs text-green-400">
                         <div>[{activeWhiteStats.name}] readyok</div>
                     </div>
                 </div>
             </div>
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
             <div className="flex-1 min-h-0 flex gap-2">
                 <PvBoard pv={activeBlackStats.pv} currentFen={fen} side="black" />
                 <div className={`flex flex-col bg-gray-900 rounded border border-gray-700 overflow-hidden transition-all duration-300 h-full ${logsExpanded ? "flex-1 min-w-[12rem]" : "w-48"}`}>
                     <div className="flex justify-between items-center bg-gray-800 px-2 py-1 cursor-pointer hover:bg-gray-700" onClick={() => setLogsExpanded(!logsExpanded)}>
                        <span className="text-sm uppercase font-bold text-gray-500">Engine Log</span>
                        {logsExpanded ? <ChevronDown size={12} className="text-gray-400"/> : <ChevronRight size={12} className="text-gray-400"/>}
                     </div>
                     <div className="flex-1 p-2 overflow-y-auto font-mono text-xs text-blue-400">
                         <div>[{activeBlackStats.name}] readyok</div>
                     </div>
                 </div>
             </div>
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

export default App;
