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

  // Settings State
  const [whitePath, setWhitePath] = useState("mock-engine");
  const [blackPath, setBlackPath] = useState("mock-engine");
  const [gamesCount, setGamesCount] = useState(10);
  const [swapSides, setSwapSides] = useState(true);

  // New Settings
  const [openingFen, setOpeningFen] = useState("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const [baseTime, setBaseTime] = useState(10000); // ms
  const [increment, setIncrement] = useState(100); // ms
  const [isPaused, setIsPaused] = useState(false);
  const [matchRunning, setMatchRunning] = useState(false);

  const [store, setStore] = useState<any>(null);

  // Load Settings
  useEffect(() => {
    const initStore = async () => {
      const s = await load('settings.json');
      setStore(s);
      const w = await s.get<string>("engine_a_path");
      const b = await s.get<string>("engine_b_path");
      if (w) setWhitePath(w);
      if (b) setBlackPath(b);
    };
    initStore();
  }, []);

  // Save Paths when changed
  useEffect(() => {
    if (!store) return;
    store.set("engine_a_path", whitePath).then(() => store.save());
  }, [whitePath, store]);

  useEffect(() => {
    if (!store) return;
    store.set("engine_b_path", blackPath).then(() => store.save());
  }, [blackPath, store]);

  // Listeners
  useEffect(() => {
    const unlistenUpdate = listen<GameUpdate>("game-update", (event) => {
      const u = event.payload;
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

    const unlistenStats = listen<EngineStats>("engine-stats", (event) => {
      const s = event.payload;
      const update = { depth: s.depth, score: s.score_cp, nodes: s.nodes, nps: s.nps, pv: s.pv };
      s.engine_idx === 0 ? setEngineAStats((p: any) => ({ ...p, ...update })) : setEngineBStats((p: any) => ({ ...p, ...update }));
    });

    return () => {
      unlistenUpdate.then(f => f());
      unlistenStats.then(f => f());
    };
  }, []);

  // Graph Logic
  useEffect(() => {
    if (moves.length > 0) {
      let score = 0;
      const whiteMoved = moves.length % 2 !== 0;
      if (whiteMoved) {
        score = (whiteEngineIdx === 0) ? engineAStats.score : engineBStats.score;
      } else {
        const blackScore = (whiteEngineIdx === 0) ? engineBStats.score : engineAStats.score;
        score = -blackScore;
      }
      setEvalHistory(prev => [...prev, { moveNumber: moves.length, score: score || 0 }]);
    } else {
      setEvalHistory([]);
    }
  }, [moves, whiteEngineIdx]);

  const startMatch = async () => {
    setMoves([]);
    setMatchResult(null);
    setMatchRunning(true);
    setIsPaused(false);

    const config = {
      white: { name: "Engine A", path: whitePath, options: [] },
      black: { name: "Engine B", path: blackPath, options: [] },
      time_control: { base_ms: baseTime, inc_ms: increment },
      games_count: gamesCount,
      swap_sides: swapSides,
      opening_fen: openingFen // Send the custom opening
    };
    await invoke("start_match", { config });
  };

  const stopMatch = async () => {
    await invoke("stop_match");
    setMatchRunning(false);
  };

  const togglePause = async () => {
    await invoke("pause_match", { paused: !isPaused });
    setIsPaused(!isPaused);
  };

  const selectFile = async (setter: (p: string) => void) => {
    const selected = await open({ multiple: false, filters: [{ name: 'Executables', extensions: ['exe', ''] }] });
    if (selected && typeof selected === 'string') setter(selected);
  };

  return (
    <div className="flex h-screen w-screen bg-gray-950 text-white overflow-hidden font-sans select-none">
      {/* Left: Engines */}
      <div className="w-80 flex flex-col border-r border-gray-700 bg-gray-900">
        <div className="p-2 bg-gray-950 text-center font-bold text-gray-500 text-xs uppercase tracking-wider">
          {whiteEngineIdx === 0 ? "White" : "Black"}
        </div>
        <EnginePanel side={whiteEngineIdx === 0 ? 'white' : 'black'} stats={engineAStats} />

        <div className="p-2 bg-gray-950 text-center font-bold text-gray-500 text-xs uppercase tracking-wider border-t border-gray-700">
          {whiteEngineIdx === 1 ? "White" : "Black"}
        </div>
        <EnginePanel side={whiteEngineIdx === 1 ? 'white' : 'black'} stats={engineBStats} />
      </div>

      {/* Center: Board */}
      <div className="flex-1 flex flex-col bg-gray-800">
        <div className="flex-1 relative flex justify-center p-4">
          <Board fen={fen} lastMove={lastMove} orientation="white" />
          {matchResult && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/80 px-6 py-4 rounded-xl backdrop-blur">
              <div className="text-2xl font-bold text-white">{matchResult}</div>
            </div>
          )}
        </div>
        <EvalGraph data={evalHistory} />
      </div>
      {/* Right: Settings */}
      <div className="w-96 flex flex-col border-l border-gray-700 bg-gray-900 overflow-y-auto">
        <div className="p-6 border-b border-gray-700 space-y-4">
          <h1 className="text-2xl font-bold text-center tracking-tight text-blue-400">Mini-TCEC</h1>

          {/* Engine Selectors */}
          <div className="space-y-2">
            <div className="flex gap-2 items-center">
              <span className="w-8 text-xs font-bold text-gray-500">A</span>
              <input value={whitePath} onChange={e => setWhitePath(e.target.value)} className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs font-mono" />
              <button onClick={() => selectFile(setWhitePath)} className="bg-gray-700 hover:bg-gray-600 px-2 rounded text-xs">...</button>
            </div>
            <div className="flex gap-2 items-center">
              <span className="w-8 text-xs font-bold text-gray-500">B</span>
              <input value={blackPath} onChange={e => setBlackPath(e.target.value)} className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs font-mono" />
              <button onClick={() => selectFile(setBlackPath)} className="bg-gray-700 hover:bg-gray-600 px-2 rounded text-xs">...</button>
            </div>
          </div>
          {/* Time Control */}
          <div className="bg-gray-800/50 p-3 rounded-lg space-y-2">
            <label className="text-xs text-gray-500 uppercase font-bold">Time Control (ms)</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <span className="text-xs text-gray-400 block">Base</span>
                <input type="number" value={baseTime} onChange={e => setBaseTime(parseInt(e.target.value))} className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm" />
              </div>
              <div className="flex-1">
                <span className="text-xs text-gray-400 block">Inc</span>
                <input type="number" value={increment} onChange={e => setIncrement(parseInt(e.target.value))} className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm" />
              </div>
            </div>
          </div>
          {/* Opening & Games */}
          <div className="space-y-2">
            <div>
              <label className="text-xs text-gray-500 uppercase font-bold">Opening FEN</label>
              <input value={openingFen} onChange={e => setOpeningFen(e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs font-mono" />
            </div>
            <div className="flex gap-4 pt-2">
              <div className="flex-1">
                <label className="text-xs text-gray-500 uppercase font-bold">Games</label>
                <input type="number" value={gamesCount} onChange={e => setGamesCount(parseInt(e.target.value))} className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm" />
              </div>
              <label className="flex items-center pt-4 cursor-pointer">
                <input type="checkbox" checked={swapSides} onChange={e => setSwapSides(e.target.checked)} className="mr-2" />
                <span className="text-xs font-bold text-gray-400 uppercase">Swap Sides</span>
              </label>
            </div>
          </div>
          {/* Controls */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            {!matchRunning ? (
              <button onClick={startMatch} className="col-span-2 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg text-sm font-bold shadow-lg shadow-blue-900/20">START MATCH</button>
            ) : (
              <>
                <button onClick={togglePause} className="bg-yellow-600 hover:bg-yellow-500 text-white py-3 rounded-lg text-sm font-bold">
                  {isPaused ? "RESUME" : "PAUSE"}
                </button>
                <button onClick={stopMatch} className="bg-red-600 hover:bg-red-500 text-white py-3 rounded-lg text-sm font-bold">STOP</button>
              </>
            )}
          </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
         <div className="bg-gray-950 px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-800">Move History</div>
         <div className="flex-1 overflow-auto"><MoveList moves={moves} /></div>
      </div>
  </div>
</div>
  );
}

export default App;