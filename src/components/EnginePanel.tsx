import React from 'react';
import { Settings } from 'lucide-react';
import { Flag } from './Flag';
import { PvBoard } from './PvBoard';

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
        score_mate?: number | null; // Added to support mate scores if needed, though existing code just uses score
    };
    side: "white" | "black";
    currentFen: string;
    onSettingsClick?: () => void; // Added callback for settings
}

export const EnginePanel: React.FC<EnginePanelProps> = ({ stats, side, currentFen, onSettingsClick }) => {
    const isWhite = side === "white";
    // Using simple score logic from existing component, though mate scores might need better handling if passed
    const scoreColor = stats.score > 0 ? (isWhite ? "text-green-400" : "text-red-400") : (stats.score < 0 ? (isWhite ? "text-red-400" : "text-green-400") : "text-gray-400");

    return (
        <div className="flex flex-col gap-2 h-full p-2 overflow-hidden">
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

             <div className="flex flex-row flex-1 min-h-0 gap-2 overflow-hidden">
                 <div className="flex-1 flex items-center justify-center min-w-0 min-h-0 overflow-hidden">
                    <div className="aspect-square w-auto h-auto max-w-full max-h-full">
                        <PvBoard pv={stats.pv} currentFen={currentFen} side={side} />
                    </div>
                 </div>

                 <div className="w-32 flex flex-col gap-2 shrink-0 text-xs font-mono text-gray-400 h-full overflow-hidden">
                     <div className="flex justify-between bg-gray-900/50 p-1.5 rounded shrink-0">
                         <span>DEPTH</span>
                         <span className="text-white">{stats.depth || 0}</span>
                     </div>
                     <div className="flex justify-between bg-gray-900/50 p-1.5 rounded shrink-0">
                         <span>NPS</span>
                         <span className="text-yellow-500">{(stats.nps ? (stats.nps / 1000).toFixed(1) + 'k' : '0')}</span>
                     </div>
                     <div className="flex justify-between bg-gray-900/50 p-1.5 rounded shrink-0">
                         <span>NODES</span>
                         <span className="text-blue-400">{(stats.nodes ? (stats.nodes / 1000000).toFixed(2) + 'M' : '0')}</span>
                     </div>

                     <div className="flex-1 bg-gray-900/30 rounded p-1.5 overflow-y-auto min-h-0 border border-gray-700/50 flex flex-col">
                        <span className="text-[10px] text-gray-500 block mb-1 uppercase shrink-0">PV</span>
                        <p className="text-[10px] font-mono text-gray-300 break-words leading-tight">
                            {stats.pv || "..."}
                        </p>
                     </div>
                 </div>
             </div>
        </div>
    );
};
