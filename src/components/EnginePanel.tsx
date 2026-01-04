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

interface EnginePanelProps {
    stats: EngineStats;
    side: 'white' | 'black';
}

export const EnginePanel: React.FC<EnginePanelProps> = ({ stats, side }) => {
    return (
        <div className={`flex flex-col p-4 ${side === 'white' ? 'bg-gray-800' : 'bg-gray-900'} text-gray-200 border-b border-gray-700 overflow-hidden`}>
            <div className="flex justify-between items-baseline mb-2 shrink-0">
                <h2 className="text-xl font-bold text-white truncate mr-2">{stats.name}</h2>
                <span className="text-2xl font-mono font-bold whitespace-nowrap">
                    {stats.score ? (stats.score > 0 ? `+${(stats.score / 100).toFixed(2)}` : (stats.score / 100).toFixed(2)) : "0.00"}
                </span>
            </div>

            {/* Stats & Text PV */}
            <div className="flex flex-col min-w-0">
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-mono text-gray-400 mb-2">
                    <span className="whitespace-nowrap">D: <span className="text-gray-200">{stats.depth || 0}</span></span>
                    <span className="whitespace-nowrap">NPS: <span className="text-gray-200">{stats.nps ? (stats.nps / 1000).toFixed(0) + "k" : 0}</span></span>
                    <span className="whitespace-nowrap">N: <span className="text-gray-200">{stats.nodes ? (stats.nodes / 1000000).toFixed(1) + "M" : 0}</span></span>
                </div>
                <div className="bg-gray-950 p-2 rounded font-mono text-[10px] leading-tight overflow-y-auto text-gray-400 mb-2 break-all h-24">
                    {stats.pv || "Thinking..."}
                </div>

                <div className="text-2xl font-mono text-center py-1 bg-black rounded text-white shrink-0">
                    {stats.time ? new Date(stats.time).toISOString().substr(14, 5) : "00:00"}
                </div>
            </div>
        </div>
    );
};
