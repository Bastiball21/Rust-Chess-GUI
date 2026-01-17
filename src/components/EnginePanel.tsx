import React from 'react';
import { Settings } from 'lucide-react';
import { Flag } from './Flag';
import { formatTime } from '../utils/formatTime';

interface EnginePanelProps {
    stats: {
        name: string;
        score: number;
        depth?: number;
        nps?: number;
        nodes?: number;
        time?: number;
        pv?: string;
        country_code?: string; // Added flag support
    };
    side: "white" | "black";
    onSettingsClick?: () => void; // Added callback for settings
}

export const EnginePanel: React.FC<EnginePanelProps> = ({ stats, side, onSettingsClick }) => {
    const isWhite = side === "white";
    const scoreColor = stats.score > 0 ? (isWhite ? "text-green-400" : "text-red-400") : (stats.score < 0 ? (isWhite ? "text-red-400" : "text-green-400") : "text-gray-400");

    return (
        <div className="flex flex-col gap-2 h-full">
             <div className="flex justify-between items-center border-b border-gray-700 pb-2 shrink-0">
                 <div className="flex items-center gap-2 min-w-0">
                     <div className={`w-3 h-3 rounded-full shrink-0 ${isWhite ? "bg-white" : "bg-black border border-gray-500"}`}></div>
                     <Flag code={stats.country_code} />
                     <span className="font-bold text-lg truncate" title={stats.name}>{stats.name}</span>
                 </div>
                 <div className="flex items-center gap-2 shrink-0">
                     <span className={`font-mono text-xl font-bold ${scoreColor}`}>
                        {stats.score ? (stats.score / 100).toFixed(2) : "0.00"}
                     </span>
                     {onSettingsClick && (
                         <button onClick={onSettingsClick} className="text-gray-500 hover:text-white transition">
                             <Settings size={16} />
                         </button>
                     )}
                 </div>
             </div>

             <div className="grid grid-cols-2 gap-2 text-xs font-mono text-gray-400 shrink-0">
                 <div className="flex justify-between bg-gray-900/50 p-1.5 rounded">
                     <span>DEPTH</span>
                     <span className="text-white">{stats.depth || 0}</span>
                 </div>
                 <div className="flex justify-between bg-gray-900/50 p-1.5 rounded">
                     <span>NPS</span>
                     <span className="text-yellow-500">{(stats.nps ? (stats.nps / 1000).toFixed(1) + 'k' : '0')}</span>
                 </div>
                 <div className="flex justify-between bg-gray-900/50 p-1.5 rounded">
                     <span>NODES</span>
                     <span className="text-blue-400">{(stats.nodes ? (stats.nodes / 1000000).toFixed(2) + 'M' : '0')}</span>
                 </div>
                 <div className="flex justify-between bg-gray-900/50 p-1.5 rounded">
                     <span>TIME</span>
                     <span className={`font-bold ${isWhite ? "text-white" : "text-gray-300"}`}>{formatTime(stats.time || 0)}</span>
                 </div>
             </div>

             <div className="flex-1 bg-gray-900/30 rounded p-2 overflow-y-auto min-h-0 border border-gray-700/50">
                <span className="text-sm text-gray-500 block mb-1">PV</span>
                <p className="text-xs font-mono text-gray-300 break-words leading-tight">
                    {stats.pv || "..."}
                </p>
             </div>
        </div>
    );
};
