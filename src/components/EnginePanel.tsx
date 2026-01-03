import React, { useMemo } from 'react';
import { Chess } from 'chess.js';
import Chessground from 'react-chessground';
import 'react-chessground/dist/styles/chessground.css';

interface EngineStats {
    name: string;
    score?: number; // cp
    depth?: number;
    nodes?: number;
    nps?: number;
    pv?: string;
    time?: number; // ms
}

interface EnginePanelProps {
    stats: EngineStats;
    side: 'white' | 'black';
    currentFen: string; // <--- New Prop
}

export const EnginePanel: React.FC<EnginePanelProps> = ({ stats, side, currentFen }) => {
    // Calculate the board state after applying the PV moves
    const pvFen = useMemo(() => {
        if (!stats.pv || !currentFen) return currentFen || "start";
        try {
            const game = new Chess(currentFen === "start" ? undefined : currentFen);
            const moves = stats.pv.split(" ");
            for (const move of moves) {
                // Parse UCI (e2e4) to chess.js object
                const from = move.slice(0, 2);
                const to = move.slice(2, 4);
                const promotion = move.length > 4 ? move.slice(4) : undefined;
                game.move({ from, to, promotion });
            }
            return game.fen();
        } catch (e) {
            return currentFen; // Fallback if PV is invalid or game ends
        }
    }, [stats.pv, currentFen]);

    return (
        <div className={`flex flex-col p-4 ${side === 'white' ? 'bg-gray-800' : 'bg-gray-900'} text-gray-200 border-b border-gray-700 h-1/2 overflow-hidden`}>
            <div className="flex justify-between items-baseline mb-2">
                <h2 className="text-xl font-bold text-white">{stats.name}</h2>
                <span className="text-2xl font-mono font-bold">
                    {stats.score ? (stats.score > 0 ? `+${(stats.score / 100).toFixed(2)}` : (stats.score / 100).toFixed(2)) : "0.00"}
                </span>
            </div>
            <div className="flex gap-4 h-full min-h-0">
                {/* Left: Stats & Text PV */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm font-mono text-gray-400 mb-2">
                        <div>Depth: <span className="text-gray-200">{stats.depth || 0}</span></div>
                        <div>NPS: <span className="text-gray-200">{stats.nps ? (stats.nps / 1000).toFixed(0) + "k" : 0}</span></div>
                        <div>Nodes: <span className="text-gray-200">{stats.nodes ? (stats.nodes / 1000000).toFixed(1) + "M" : 0}</span></div>
                    </div>
                    <div className="flex-1 bg-gray-950 p-2 rounded font-mono text-xs overflow-y-auto text-gray-400 mb-2">
                        {stats.pv || "Thinking..."}
                    </div>

                    <div className="text-4xl font-mono text-center py-2 bg-black rounded text-white">
                        {stats.time ? new Date(stats.time).toISOString().substr(14, 5) : "00:00"}
                    </div>
                </div>
                {/* Right: PV Board */}
                <div className="w-40 shrink-0 bg-gray-800 rounded border border-gray-600 flex items-center justify-center overflow-hidden">
                    <div className="w-[158px] h-[158px] pointer-events-none">
                        <Chessground
                            fen={pvFen === "start" ? undefined : pvFen}
                            orientation={side}
                            viewOnly={true}
                            width="100%"
                            height="100%"
                            config={{
                                viewOnly: true,
                                coordinates: false,
                                movable: { color: undefined }
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
