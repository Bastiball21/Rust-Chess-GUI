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
}

interface EngineStats {
  engine_idx: number;
  depth: number;
  score_cp: number;
  nodes: number;
  nps: number;
  pv: string;
}

function App() {
  const [fen, setFen] = useState("start");
  const [lastMove, setLastMove] = useState<string[]>([]);
  const [moves, setMoves] = useState<string[]>([]);
  const [engineAStats, setEngineAStats] = useState({ name: "Engine A", score: 0 });
  const [engineBStats, setEngineBStats] = useState({ name: "Engine B", score: 0 });
  const [whiteEngineIdx, setWhiteEngineIdx] = useState(0);
  const [evalHistory, setEvalHistory] = useState<any[]>([]);
  const [matchResult, setMatchResult] = useState<string | null>(null);
  // Settings
  const [whitePath, setWhitePath] = useState("mock-engine");
  const [blackPath, setBlackPath] = useState("mock-engine");
  const [gamesCount, setGamesCount] = useState(10);
  const [swapSides, setSwapSides] = useState(true);
  const [openingFen, setOpeningFen] = useState("");
  const [variant, setVariant] = useState("standard");
  const [baseTime, setBaseTime] = useState(10000);
  const [increment, setIncrement] = useState(100);
  const [isPaused, setIsPaused] = useState(false);
  const [matchRunning, setMatchRunning] = useState(false);
  const [store, setStore] = useState<any>(null);

  useEffect(() => {
    const initStore = async () => {
      const s = await load('settings.json');
      setStore(s);
      const w = await s.get("engine_a_path");
      const b = await s.get("engine_b_path");
      if (w) setWhitePath(w as string);
      if (b) setBlackPath(b as string);
    };
    initStore();
  }, []);

  useEffect(() => {
    if (!store) return;
    store.set("engine_a_path", whitePath).then(() => store.save());
    store.set("engine_b_path", blackPath).then(() => store.save());
  }, [whitePath, blackPath, store]);

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
      if (u.white_engine_idx === 0) {
        setEngineAStats((s: any) => ({ ...s, time: u.white_time }));
        setEngineBStats((s: any) => ({ ...s, time: u.black_time }));
      } else {
        setEngineBStats((s: any) => ({ ...s, time: u.white_time }));
        setEngineAStats((s: any) => ({ ...s, time: u.black_time }));
      }
      if (u.result) setMatchResult(`Game Over: ${u.result}`);
    });
    const unlistenStats = listen("engine-stats", (event: any) => {
      const s = event.payload;
      const update = { depth: s.depth, score: s.score_cp, nodes: s.nodes, nps: s.nps, pv: s.pv };
      s.engine_idx === 0 ? setEngineAStats((p:any) => ({...p, ...update})) : setEngineBStats((p:any) => ({...p, ...update}));
    });
    return () => { unlistenUpdate.then(f => f()); unlistenStats.then(f => f()); };
  }, []);

  useEffect(() => {
    if (moves.length > 0) {
      let score = 0;
      const whiteMoved = moves.length % 2 !== 0;
      if (whiteMoved) score = (whiteEngineIdx === 0) ? engineAStats.score : engineBStats.score;
      else score = -((whiteEngineIdx === 0) ? engineBStats.score : engineAStats.score);
      setEvalHistory(prev => [...prev, { moveNumber: moves.length, score: score || 0 }]);
    } else {
      setEvalHistory([]);
    }
  }, [moves, whiteEngineIdx]);

  const startMatch = async () => {
    setMoves([]); setMatchResult(null); setMatchRunning(true); setIsPaused(false);
    const config = {
      white: { name: "Engine A", path: whitePath, options: [] },
      black: { name: "Engine B", path: blackPath, options: [] },
      time_control: { base_ms: baseTime, inc_ms: increment },
      games_count: gamesCount,
      swap_sides: swapSides,
      opening_fen: openingFen || null,
      variant: variant
    };
    await invoke("start_match", { config });
  };

  const stopMatch = async () => { await invoke("stop_match"); setMatchRunning(false); };
  const togglePause = async () => { await invoke("pause_match", { paused: !isPaused }); setIsPaused(!isPaused); };
  const selectFile = async (setter: (p: string) => void) => {
    const selected = await open({ multiple: false, filters: [{ name: 'Executables', extensions: ['exe', ''] }] });
    if (selected && typeof selected === 'string') setter(selected);
  };

  return (
    <div className="h-screen w-screen bg-gray-900 text-white flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 bg-gray-800 p-4 flex flex-col gap-4 border-r border-gray-700 overflow-y-auto">
        <h1 className="text-xl font-bold text-center text-blue-400">Mini-TCEC</h1>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-400 uppercase">Engine A (White start)</label>
          <div className="flex gap-2">
            <input className="bg-gray-700 p-2 rounded w-full text-xs" value={whitePath} onChange={(e) => setWhitePath(e.target.value)} />
            <button className="bg-blue-600 px-3 py-1 rounded hover:bg-blue-500 text-xs" onClick={() => selectFile(setWhitePath)}>...</button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-400 uppercase">Engine B (Black start)</label>
          <div className="flex gap-2">
            <input className="bg-gray-700 p-2 rounded w-full text-xs" value={blackPath} onChange={(e) => setBlackPath(e.target.value)} />
            <button className="bg-blue-600 px-3 py-1 rounded hover:bg-blue-500 text-xs" onClick={() => selectFile(setBlackPath)}>...</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
           <div>
              <label className="text-xs font-semibold text-gray-400 uppercase">Time (ms)</label>
              <input type="number" className="bg-gray-700 p-2 rounded w-full text-xs" value={baseTime} onChange={(e) => setBaseTime(parseInt(e.target.value))} />
           </div>
           <div>
              <label className="text-xs font-semibold text-gray-400 uppercase">Inc (ms)</label>
              <input type="number" className="bg-gray-700 p-2 rounded w-full text-xs" value={increment} onChange={(e) => setIncrement(parseInt(e.target.value))} />
           </div>
        </div>

        <div className="space-y-2">
           <label className="text-xs font-semibold text-gray-400 uppercase">Variant</label>
           <select className="bg-gray-700 p-2 rounded w-full text-xs" value={variant} onChange={(e) => setVariant(e.target.value)}>
             <option value="standard">Standard</option>
             <option value="chess960">Chess960</option>
           </select>
        </div>

        <div className="space-y-2">
           <label className="text-xs font-semibold text-gray-400 uppercase">Opening FEN (Optional)</label>
           <input className="bg-gray-700 p-2 rounded w-full text-xs" placeholder="Leave empty for start pos / random 960" value={openingFen} onChange={(e) => setOpeningFen(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-2">
           <div className="flex items-center gap-2">
              <input type="checkbox" checked={swapSides} onChange={(e) => setSwapSides(e.target.checked)} />
              <span className="text-sm">Swap Sides</span>
           </div>
           <div className="flex items-center gap-2">
              <span className="text-sm">Games:</span>
              <input type="number" className="bg-gray-700 p-1 rounded w-16 text-xs" value={gamesCount} onChange={(e) => setGamesCount(parseInt(e.target.value))} />
           </div>
        </div>

        <div className="flex flex-col gap-2 mt-auto">
          {!matchRunning ? (
            <button className="bg-green-600 p-3 rounded font-bold hover:bg-green-500 transition" onClick={startMatch}>START MATCH</button>
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-4 gap-4 bg-gray-900 overflow-hidden">
        {/* Top Panels */}
        <div className="grid grid-cols-3 gap-4 h-full min-h-0">

          {/* Left: Engine A Info */}
          <div className="bg-gray-800 rounded-lg p-4 flex flex-col gap-2 border border-gray-700 shadow-lg">
             <EnginePanel stats={engineAStats} />
             <div className="flex-1 bg-gray-900 rounded border border-gray-700 p-2 overflow-y-auto font-mono text-xs text-green-400">
               {/* Engine Log Placeholder */}
               <div>[Engine A] readyok</div>
               <div>[Engine A] info depth 10 score cp 25</div>
             </div>
          </div>

          {/* Center: Board */}
          <div className="flex flex-col gap-2 items-center justify-center bg-gray-800 rounded-lg p-4 border border-gray-700 shadow-lg relative">
             <div className="text-2xl font-bold text-gray-200 mb-2">
               {matchResult ? <span className="text-yellow-400">{matchResult}</span> : <span>Game in Progress...</span>}
             </div>
             <Board fen={fen} lastMove={lastMove} config={{ movable: { viewOnly: true } }} />
          </div>

          {/* Right: Engine B Info */}
          <div className="bg-gray-800 rounded-lg p-4 flex flex-col gap-2 border border-gray-700 shadow-lg">
             <EnginePanel stats={engineBStats} />
             <div className="flex-1 bg-gray-900 rounded border border-gray-700 p-2 overflow-y-auto font-mono text-xs text-blue-400">
                {/* Engine Log Placeholder */}
                <div>[Engine B] readyok</div>
                <div>[Engine B] info depth 9 score cp -10</div>
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
