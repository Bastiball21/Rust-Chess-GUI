import React from 'react';
import { EnginePanel } from './EnginePanel';
import { EngineStats, GameUpdate } from '../App';

interface StatsPanelProps {
  gameUpdate: GameUpdate | null;
  whiteStats: EngineStats | null;
  blackStats: EngineStats | null;
  whiteName: string;
  blackName: string;
  whiteLogo?: string;
  blackLogo?: string;
  currentFen: string;
}

const StatsPanel: React.FC<StatsPanelProps> = ({
    whiteStats, blackStats, whiteName, blackName, currentFen
}) => {
  return (
    <div className="h-full flex flex-col gap-4">
        <div className="flex-1 min-h-0 bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden p-2">
            <EnginePanel
                side="white"
                currentFen={currentFen}
                stats={{
                    name: whiteName,
                    score: whiteStats?.score_cp ?? 0,
                    score_mate: whiteStats?.score_mate,
                    depth: whiteStats?.depth,
                    nps: whiteStats?.nps,
                    nodes: whiteStats?.nodes,
                    pv: whiteStats?.pv,
                }}
            />
        </div>
        <div className="flex-1 min-h-0 bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden p-2">
             <EnginePanel
                side="black"
                currentFen={currentFen}
                stats={{
                    name: blackName,
                    score: blackStats?.score_cp ?? 0,
                    score_mate: blackStats?.score_mate,
                    depth: blackStats?.depth,
                    nps: blackStats?.nps,
                    nodes: blackStats?.nodes,
                    pv: blackStats?.pv,
                }}
            />
        </div>
    </div>
  );
};

export default StatsPanel;
