import React, { useState, useEffect } from "react";
import { Board } from "./components/Board";
import { EnginePanel } from "./components/EnginePanel";
import { EvalGraph } from "./components/EvalGraph";
import { MoveList } from "./components/MoveList";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface GameUpdate {
  fen: string;
  last_move: string | null;
  white_time: number;
  black_time: number;
  move_number: number;
  result: string | null;
}

interface EngineStats {
  engine_idx: number; // 0=White, 1=Black
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
  const [whiteStats, setWhiteStats] = useState<any>({ name: "Stockfish 16", score: 0 });
  const [blackStats, setBlackStats] = useState<any>({ name: "Aether 1.0", score: 0 });
  const [evalHistory, setEvalHistory] = useState<any[]>([]);

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
       setWhiteStats(s => ({ ...s, time: u.white_time }));
       setBlackStats(s => ({ ...s, time: u.black_time }));
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
           setWhiteStats((prev: any) => ({ ...prev, ...update }));
           // Only update history if moveNumber changed or significant update?
           // Better: Update history only on game-update (move played) or use a separate logic.
           // For now, let's keep it simple but maybe limit frequency?
           // Actually, the Review said "Eval Graph Data: The EvalGraph currently pushes a new data point for every info line".
           // We should only push to graph when a move is made (final score) OR when depth increases significantly.
           // Or simpler: Update current evaluation, but only add to history on move.
       } else {
           setBlackStats((prev: any) => ({ ...prev, ...update }));
       }
    });

    return () => {
        unlistenUpdate.then(f => f());
        unlistenStats.then(f => f());
    };
  }, []);

  // When a move is made, we should record the evaluation of the side that just moved.
  useEffect(() => {
     if (moves.length > 0) {
        // Last move was made by...
        const moveNum = moves.length;
        // If white just moved (moveNum is odd), we record White's last score?
        // Actually, TCEC graph shows evaluation of the position over moves.
        // We can grab the score from the stats.
        const score = (moves.length % 2 !== 0) ? whiteStats.score : blackStats.score;
        setEvalHistory(prev => [...prev, { moveNumber: moveNum, score: score || 0 }]);
     }
  }, [moves]);

  const [whitePath, setWhitePath] = useState("mock-engine");
  const [blackPath, setBlackPath] = useState("mock-engine");

  const startMatch = async () => {
      const config = {
          white: { name: "White Engine", path: whitePath, options: [] },
          black: { name: "Black Engine", path: blackPath, options: [] },
          time_control: { base_ms: 60000, inc_ms: 1000 }
      };
      await invoke("start_match", { config });
  };

  const stopMatch = async () => {
      await invoke("stop_match");
  };

  return (
    <div className="flex h-screen w-screen bg-gray-950 text-white overflow-hidden font-sans">
      {/* Left Column: Engines */}
      <div className="w-80 flex flex-col border-r border-gray-700">
        <EnginePanel side="white" stats={whiteStats} />
        <EnginePanel side="black" stats={blackStats} />
      </div>

      {/* Center: Board */}
      <div className="flex-1 flex flex-col">
          <div className="flex-1 relative">
             <Board fen={fen} lastMove={lastMove} />
          </div>
          <EvalGraph data={evalHistory} />
      </div>

      {/* Right Column: Game Info */}
      <div className="w-80 flex flex-col border-l border-gray-700 bg-gray-900">
          <div className="p-4 border-b border-gray-700">
              <h1 className="text-xl font-bold mb-4">Mini-TCEC</h1>

              <div className="mb-4 space-y-2">
                  <input
                    type="text"
                    value={whitePath}
                    onChange={e => setWhitePath(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-300"
                    placeholder="White Engine Path"
                  />
                  <input
                    type="text"
                    value={blackPath}
                    onChange={e => setBlackPath(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-300"
                    placeholder="Black Engine Path"
                  />
              </div>

              <div className="flex gap-2">
                  <button onClick={startMatch} className="flex-1 bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-sm font-bold transition">
                      Run Match
                  </button>
                  <button onClick={stopMatch} className="flex-1 bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm font-bold transition">
                      Stop
                  </button>
              </div>
          </div>
          <div className="flex-1 overflow-hidden">
             <MoveList moves={moves} />
          </div>
          <div className="h-32 p-2 border-t border-gray-700 text-xs text-gray-400 font-mono overflow-y-auto">
              System Log: <br/>
              Ready.
          </div>
      </div>
    </div>
  );
}

export default App;
