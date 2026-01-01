import React, { useState, useEffect } from "react";
import { Board } from "./components/Board";
import { EnginePanel } from "./components/EnginePanel";
import { EvalGraph } from "./components/EvalGraph";
import { MoveList } from "./components/MoveList";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import { open } from "@tauri-apps/plugin-dialog";

// We will initialize store inside component
// const store = new Store("settings.json");

interface GameUpdate {
  fen: string;
  last_move: string | null;
  white_time: number;
  black_time: number;
  move_number: number;
  result: string | null;
  white_engine_idx: number; // 0=EngineA, 1=EngineB
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

  // Engine A and B stats (fixed slots in UI)
  const [engineAStats, setEngineAStats] = useState<any>({ name: "Engine A", score: 0 });
  const [engineBStats, setEngineBStats] = useState<any>({ name: "Engine B", score: 0 });

  // Who is playing white?
  const [whiteEngineIdx, setWhiteEngineIdx] = useState(0);

  const [evalHistory, setEvalHistory] = useState<any[]>([]);
  const [matchResult, setMatchResult] = useState<string | null>(null);

  // Settings
  const [whitePath, setWhitePath] = useState("mock-engine");
  const [blackPath, setBlackPath] = useState("mock-engine"); // actually engine A and B paths
  const [gamesCount, setGamesCount] = useState(10);
  const [swapSides, setSwapSides] = useState(true);

  const [currentGameNumber, setCurrentGameNumber] = useState(1);
  const [store, setStore] = useState<any>(null);

  useEffect(() => {
    const initStore = async () => {
        // Force manual save to avoid type issues with options or just omit options if default is okay.
        // Documentation says { autoSave: number | boolean } might be valid but TS definitions might lag.
        // Let's rely on manual save.
        const s = await load('settings.json');
        setStore(s);

        const w = await s.get<string>("engine_a_path");
        const b = await s.get<string>("engine_b_path");
        const g = await s.get<number>("games_count");
        const swap = await s.get<boolean>("swap_sides");

        if (w) setWhitePath(w);
        if (b) setBlackPath(b);
        if (g) setGamesCount(g);
        if (swap !== undefined) setSwapSides(swap);
    };
    initStore();
  }, []);

  // Save settings on change
  useEffect(() => {
      if (!store) return;
      const save = async () => {
          await store.set("engine_a_path", whitePath);
          await store.save();
      };
      save();
  }, [whitePath, store]);

  useEffect(() => {
      if (!store) return;
      const save = async () => {
          await store.set("engine_b_path", blackPath);
          await store.save();
      };
      save();
  }, [blackPath, store]);

  useEffect(() => {
      if (!store) return;
      const save = async () => {
          await store.set("games_count", gamesCount);
          await store.save();
      };
      save();
  }, [gamesCount, store]);

  useEffect(() => {
      if (!store) return;
      const save = async () => {
          await store.set("swap_sides", swapSides);
          await store.save();
      };
      save();
  }, [swapSides, store]);

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

       // Update logic based on who is white
       setWhiteEngineIdx(u.white_engine_idx);

       // Map times to engines?
       // If u.white_engine_idx == 0, then Engine A is White.
       // u.white_time belongs to Engine A.
       if (u.white_engine_idx === 0) {
           setEngineAStats((s: any) => ({ ...s, time: u.white_time }));
           setEngineBStats((s: any) => ({ ...s, time: u.black_time }));
       } else {
           setEngineBStats((s: any) => ({ ...s, time: u.white_time }));
           setEngineAStats((s: any) => ({ ...s, time: u.black_time }));
       }

       if (u.result) {
           setMatchResult(`Game Over: ${u.result}`);
           // Maybe increment game count locally or wait for reset?
           // The backend loop continues.
           // We might want to detect "New Game" (fen is startpos and move_number is small)
       }

       if (u.fen.includes("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR") || u.move_number === 1) {
           // Reset for new game?
           // Only if we haven't already
       }
    });

    const unlistenStats = listen<EngineStats>("engine-stats", (event) => {
       const s = event.payload;
       const update = {
           depth: s.depth,
           score: s.score_cp,
           nodes: s.nodes,
           nps: s.nps,
           pv: s.pv
       };
       if (s.engine_idx === 0) {
           setEngineAStats((prev: any) => ({ ...prev, ...update }));
       } else {
           setEngineBStats((prev: any) => ({ ...prev, ...update }));
       }
    });

    return () => {
        unlistenUpdate.then(f => f());
        unlistenStats.then(f => f());
    };
  }, []);

  useEffect(() => {
     if (moves.length > 0) {
        const moveNum = moves.length;
        // Eval to graph
        // If white moved, we want white's eval?
        // Let's just graph White's perspective score.
        // If Engine A is white (idx 0), use A's score.
        // If Engine B is white (idx 1), use B's score.

        // Wait, stats come asynchronously.
        // Let's use whatever stats we have for the side that just moved.
        let score = 0;

        // White just moved (moves.length is odd? No, 1st move is white. Length 1.)
        // If length is odd, White moved.
        // If length is even, Black moved.

        const whiteMoved = moves.length % 2 !== 0;

        if (whiteMoved) {
            // Get score from White Engine
            score = (whiteEngineIdx === 0) ? engineAStats.score : engineBStats.score;
        } else {
            // Get score from Black Engine (inverted?)
            // Usually graph is from White's perspective.
            // If Black thinks -50, that means White is +0.50.
            const blackScore = (whiteEngineIdx === 0) ? engineBStats.score : engineAStats.score;
            score = -blackScore;
        }

        setEvalHistory(prev => [...prev, { moveNumber: moveNum, score: score || 0 }]);
     } else {
         setEvalHistory([]);
         setMatchResult(null);
     }
  }, [moves, whiteEngineIdx, engineAStats.score, engineBStats.score]);

  const startMatch = async () => {
      setMoves([]);
      setMatchResult(null);
      const config = {
          white: { name: "Engine A", path: whitePath, options: [] },
          black: { name: "Engine B", path: blackPath, options: [] },
          time_control: { base_ms: 10000, inc_ms: 100 }, // Fast default for testing
          games_count: parseInt(gamesCount.toString()),
          swap_sides: swapSides
      };
      await invoke("start_match", { config });
  };

  const stopMatch = async () => {
      await invoke("stop_match");
  };

  const selectFile = async (setter: (p: string) => void) => {
      const selected = await open({
          multiple: false,
          filters: [{
              name: 'Executables',
              extensions: ['exe', '']
          }]
      });
      if (selected && typeof selected === 'string') {
          setter(selected);
      }
  };

  return (
    <div className="flex h-screen w-screen bg-gray-950 text-white overflow-hidden font-sans select-none">
      {/* Left Column: Engines */}
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

      {/* Right Column: Game Info */}
      <div className="w-80 flex flex-col border-l border-gray-700 bg-gray-900">
          <div className="p-6 border-b border-gray-700 space-y-4">
              <h1 className="text-2xl font-bold text-center tracking-tight text-blue-400">Mini-TCEC</h1>

              <div className="space-y-3">
                  <div>
                      <label className="text-xs text-gray-500 uppercase font-bold">Engine A</label>
                      <div className="flex gap-2">
                        <input
                            type="text"
                            value={whitePath}
                            onChange={e => setWhitePath(e.target.value)}
                            className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300 font-mono"
                            placeholder="Path to Engine A"
                        />
                        <button onClick={() => selectFile(setWhitePath)} className="bg-gray-700 hover:bg-gray-600 px-2 rounded text-xs">...</button>
                      </div>
                  </div>

                  <div>
                      <label className="text-xs text-gray-500 uppercase font-bold">Engine B</label>
                      <div className="flex gap-2">
                        <input
                            type="text"
                            value={blackPath}
                            onChange={e => setBlackPath(e.target.value)}
                            className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300 font-mono"
                            placeholder="Path to Engine B"
                        />
                        <button onClick={() => selectFile(setBlackPath)} className="bg-gray-700 hover:bg-gray-600 px-2 rounded text-xs">...</button>
                      </div>
                  </div>

                  <div className="flex gap-4">
                      <div className="flex-1">
                          <label className="text-xs text-gray-500 uppercase font-bold">Games</label>
                          <input
                            type="number"
                            value={gamesCount}
                            onChange={e => setGamesCount(parseInt(e.target.value))}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm"
                          />
                      </div>
                      <div className="flex items-center pt-4">
                          <input
                            type="checkbox"
                            checked={swapSides}
                            onChange={e => setSwapSides(e.target.checked)}
                            className="mr-2"
                          />
                          <span className="text-sm text-gray-300">Swap Sides</span>
                      </div>
                  </div>
              </div>

              <div className="flex gap-2 pt-2">
                  <button onClick={startMatch} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-lg text-sm font-bold transition shadow-lg shadow-blue-900/20">
                      START MATCH
                  </button>
                  <button onClick={stopMatch} className="flex-1 bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-800 px-4 py-3 rounded-lg text-sm font-bold transition">
                      ABORT
                  </button>
              </div>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
             <div className="bg-gray-950 px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-800">
                 Move History
             </div>
             <div className="flex-1 overflow-auto">
                <MoveList moves={moves} />
             </div>
          </div>
      </div>
    </div>
  );
}

export default App;
