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

interface EngineOption {
    name: string;
    value: string;
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
  const [openingFile, setOpeningFile] = useState<string | null>(null);

  const [baseTimeMin, setBaseTimeMin] = useState(1);
  const [baseTimeSec, setBaseTimeSec] = useState(0);
  const [incSec, setIncSec] = useState(1);

  const [isPaused, setIsPaused] = useState(false);
  const [matchRunning, setMatchRunning] = useState(false);

  // Engine Options & Modal
  const [showOptionsModal, setShowOptionsModal] = useState<number | null>(null); // 0 for A, 1 for B
  const [engineAOptions, setEngineAOptions] = useState<EngineOption[]>([]);
  const [engineBOptions, setEngineBOptions] = useState<EngineOption[]>([]);
  const [syzygyPath, setSyzygyPath] = useState("");

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

    // Prepare Options
    const optsA = [...engineAOptions.map(o => [o.name, o.value])];
    const optsB = [...engineBOptions.map(o => [o.name, o.value])];

    if (syzygyPath) {
        optsA.push(["SyzygyPath", syzygyPath]);
        optsB.push(["SyzygyPath", syzygyPath]);
    }

    const baseMs = (baseTimeMin * 60 + baseTimeSec) * 1000;
    const incMs = incSec * 1000;

    const config = {
      white: { name: "Engine A", path: whitePath, options: optsA },
      black: { name: "Engine B", path: blackPath, options: optsB },
      time_control: { base_ms: baseMs, inc_ms: incMs },
      games_count: gamesCount,
      swap_sides: swapSides,
      opening_fen: openingFile ? null : openingFen,
      opening_file: openingFile
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

  const selectFile = async (setter: (p: string) => void, filters: any[] = []) => {
    const selected = await open({ multiple: false, filters });
    if (selected && typeof selected === 'string') setter(selected);
  };

  const addOption = (idx: number) => {
      if (idx === 0) setEngineAOptions([...engineAOptions, { name: "", value: "" }]);
      else setEngineBOptions([...engineBOptions, { name: "", value: "" }]);
  };

  const updateOption = (idx: number, optIdx: number, field: 'name' | 'value', val: string) => {
      if (idx === 0) {
          const newOpts = [...engineAOptions];
          newOpts[optIdx][field] = val;
          setEngineAOptions(newOpts);
      } else {
          const newOpts = [...engineBOptions];
          newOpts[optIdx][field] = val;
          setEngineBOptions(newOpts);
      }
  };

  const removeOption = (idx: number, optIdx: number) => {
      if (idx === 0) {
          setEngineAOptions(engineAOptions.filter((_, i) => i !== optIdx));
      } else {
          setEngineBOptions(engineBOptions.filter((_, i) => i !== optIdx));
      }
  };

  return (
    <div className="flex h-screen w-screen bg-gray-950 text-white overflow-hidden font-sans select-none relative">
      {/* Modal */}
      {showOptionsModal !== null && (
          <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-8">
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg shadow-2xl">
                  <h3 className="text-xl font-bold mb-4 text-blue-400">
                      Configure Engine {showOptionsModal === 0 ? "A" : "B"}
                  </h3>
                  <div className="space-y-2 mb-4 max-h-[60vh] overflow-y-auto">
                      {(showOptionsModal === 0 ? engineAOptions : engineBOptions).map((opt, i) => (
                          <div key={i} className="flex gap-2">
                              <input placeholder="Option Name" className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm"
                                  value={opt.name} onChange={e => updateOption(showOptionsModal, i, 'name', e.target.value)} />
                              <input placeholder="Value" className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm"
                                  value={opt.value} onChange={e => updateOption(showOptionsModal, i, 'value', e.target.value)} />
                              <button onClick={() => removeOption(showOptionsModal, i)} className="text-red-500 hover:text-red-400 px-2 font-bold">X</button>
                          </div>
                      ))}
                      <button onClick={() => addOption(showOptionsModal)} className="w-full py-2 border-2 border-dashed border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-400 rounded text-sm font-bold">
                          + Add Option
                      </button>
                  </div>
                  <div className="flex justify-end">
                      <button onClick={() => setShowOptionsModal(null)} className="bg-blue-600 px-6 py-2 rounded text-sm font-bold">Done</button>
                  </div>
              </div>
          </div>
      )}

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
              <div className="flex-1 flex gap-1">
                  <input value={whitePath} readOnly className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs font-mono truncate" />
                  <button onClick={() => setShowOptionsModal(0)} className="bg-gray-700 hover:bg-gray-600 px-2 rounded text-xs">⚙️</button>
              </div>
              <button onClick={() => selectFile(setWhitePath, [{name:'Executables', extensions:['exe','']}])} className="bg-gray-700 hover:bg-gray-600 px-2 rounded text-xs">...</button>
            </div>
            <div className="flex gap-2 items-center">
              <span className="w-8 text-xs font-bold text-gray-500">B</span>
              <div className="flex-1 flex gap-1">
                  <input value={blackPath} readOnly className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs font-mono truncate" />
                   <button onClick={() => setShowOptionsModal(1)} className="bg-gray-700 hover:bg-gray-600 px-2 rounded text-xs">⚙️</button>
              </div>
              <button onClick={() => selectFile(setBlackPath, [{name:'Executables', extensions:['exe','']}])} className="bg-gray-700 hover:bg-gray-600 px-2 rounded text-xs">...</button>
            </div>
          </div>

          {/* Adjudication (TB) */}
           <div className="bg-gray-800/50 p-3 rounded-lg space-y-2">
              <label className="text-xs text-gray-500 uppercase font-bold">Tablebase (Adjudication)</label>
              <div className="flex gap-2">
                   <input value={syzygyPath} onChange={e => setSyzygyPath(e.target.value)} placeholder="Path to Syzygy folder" className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs" />
                   <button onClick={() => selectFile(setSyzygyPath, [])} className="bg-gray-700 hover:bg-gray-600 px-2 rounded text-xs">...</button>
              </div>
           </div>

          {/* Time Control */}
          <div className="bg-gray-800/50 p-3 rounded-lg space-y-2">
            <label className="text-xs text-gray-500 uppercase font-bold">Time Control</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <span className="text-xs text-gray-400 block">Base (Min)</span>
                <input type="number" value={baseTimeMin} onChange={e => setBaseTimeMin(parseInt(e.target.value) || 0)} className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm" />
              </div>
              <div className="flex-1">
                <span className="text-xs text-gray-400 block">Base (Sec)</span>
                <input type="number" value={baseTimeSec} onChange={e => setBaseTimeSec(parseInt(e.target.value) || 0)} className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm" />
              </div>
              <div className="flex-1">
                <span className="text-xs text-gray-400 block">Inc (Sec)</span>
                <input type="number" value={incSec} onChange={e => setIncSec(parseInt(e.target.value) || 0)} className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm" />
              </div>
            </div>
          </div>
          {/* Opening & Games */}
          <div className="space-y-2">
            <div>
              <div className="flex justify-between items-center mb-1">
                  <label className="text-xs text-gray-500 uppercase font-bold">Opening</label>
                  <div className="text-xs space-x-2">
                      <span className={`cursor-pointer ${!openingFile ? 'text-blue-400 font-bold' : 'text-gray-600'}`} onClick={() => setOpeningFile(null)}>FEN</span>
                      <span className="text-gray-700">|</span>
                      <span className={`cursor-pointer ${openingFile ? 'text-blue-400 font-bold' : 'text-gray-600'}`} onClick={() => selectFile(setOpeningFile, [{name:'Opening', extensions:['epd', 'pgn']}])}>FILE</span>
                  </div>
              </div>

              {!openingFile ? (
                   <input value={openingFen} onChange={e => setOpeningFen(e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs font-mono" placeholder="Paste FEN here..." />
              ) : (
                  <div className="flex gap-2">
                      <input value={openingFile} readOnly className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs font-mono truncate text-gray-400" />
                      <button onClick={() => setOpeningFile(null)} className="text-red-500 font-bold px-2">X</button>
                  </div>
              )}
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
