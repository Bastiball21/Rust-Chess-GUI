import React from 'react';

interface EngineStats {
    name: string;
    score?: number; // cp
    depth?: number;
    nodes?: number;
    nps?: number;
    pv?: string;
    time?: number; // ms
}

export const EnginePanel: React.FC<{ stats: EngineStats, side: 'white' | 'black' }> = ({ stats, side }) => {
    return (
        <div className={`flex flex-col p-4 ${side === 'white' ? 'bg-gray-800' : 'bg-gray-900'} text-gray-200 border-b border-gray-700 h-1/2 overflow-hidden`}>
            <div className="flex justify-between items-baseline mb-2">
                <h2 className="text-xl font-bold text-white">{stats.name}</h2>
                <span className="text-2xl font-mono font-bold">
                    {stats.score ? (stats.score > 0 ? `+${(stats.score / 100).toFixed(2)}` : (stats.score / 100).toFixed(2)) : "0.00"}
                </span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm font-mono text-gray-400 mb-2">
                <div>Depth: <span className="text-gray-200">{stats.depth || 0}</span></div>
                <div>NPS: <span className="text-gray-200">{stats.nps ? (stats.nps / 1000).toFixed(0) + "k" : 0}</span></div>
                <div>Nodes: <span className="text-gray-200">{stats.nodes ? (stats.nodes / 1000000).toFixed(1) + "M" : 0}</span></div>
                <div>TB Hits: 0</div>
            </div>

            <div className="flex-1 bg-gray-950 p-2 rounded font-mono text-xs overflow-y-auto text-gray-400">
                {stats.pv || "Thinking..."}
            </div>

             <div className="mt-2 text-4xl font-mono text-center py-2 bg-black rounded text-white">
                {stats.time ? new Date(stats.time).toISOString().substr(14, 5) : "00:00"}
            </div>
        </div>
    );
};
