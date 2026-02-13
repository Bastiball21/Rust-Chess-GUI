import React, { useMemo, useState } from 'react';
import { Activity, List } from 'lucide-react';
import { MoveList } from './MoveList';
import { Clock } from './Clock';

interface EvalMovePanelProps {
  evalHistory: number[];
  currentEval: string;
  moves: string[];
  whiteTime?: number;
  blackTime?: number;
  activeColor?: 'white' | 'black'; // No default, allows undefined
}

const EvalMovePanel: React.FC<EvalMovePanelProps> = ({
  evalHistory,
  currentEval,
  moves,
  whiteTime = 0,
  blackTime = 0,
  activeColor,
}) => {
  const [activeTab, setActiveTab] = useState<'eval' | 'moves'>('eval');

  const chart = useMemo(() => {
    if (evalHistory.length === 0) {
      return { points: '', maxAbs: 1 };
    }
    const maxAbs = Math.max(1, ...evalHistory.map((value) => Math.abs(value)));
    const width = 320;
    const height = 140;
    const points = evalHistory.map((value, index) => {
      const x = evalHistory.length === 1 ? 0 : (index / (evalHistory.length - 1)) * width;
      const normalized = (value + maxAbs) / (2 * maxAbs);
      const y = (1 - normalized) * height;
      return `${x},${y}`;
    }).join(' ');

    return { points, maxAbs };
  }, [evalHistory]);

  return (
    <div className="h-full flex flex-col bg-[#262421] text-gray-300 rounded-lg overflow-hidden border border-[#3C3B39] shadow-lg">

      {/* --- TCEC STYLE CLOCK HEADER --- */}
      <div className="bg-[#1b1b1b] p-3 border-b border-[#333] grid grid-cols-2 gap-3">
        <Clock
            timeMs={whiteTime}
            isActive={activeColor === 'white'}
            side="white"
        />
        <Clock
            timeMs={blackTime}
            isActive={activeColor === 'black'}
            side="black"
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#3C3B39] bg-[#212121]">
        <button
          onClick={() => setActiveTab('eval')}
          className={`flex-1 py-2 text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'eval' ? 'bg-[#3C3B39] text-blue-400' : 'text-gray-500 hover:bg-[#2b2b2b]'
          }`}
        >
          <Activity size={14} /> Eval
        </button>
        <button
          onClick={() => setActiveTab('moves')}
          className={`flex-1 py-2 text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'moves' ? 'bg-[#3C3B39] text-blue-400' : 'text-gray-500 hover:bg-[#2b2b2b]'
          }`}
        >
          <List size={14} /> Moves
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-3 overflow-hidden bg-[#262421]">
        {activeTab === 'eval' && (
          <div className="h-full flex flex-col gap-3">
             {/* Eval Number */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Current eval</div>
                <div className="text-2xl font-mono font-bold text-gray-200">{currentEval}</div>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">History</div>
            </div>

            {/* Chart */}
            <div className="flex-1 bg-[#1e1e1e] rounded border border-[#333] p-2 relative">
              {evalHistory.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-gray-600">
                  Waiting for data...
                </div>
              ) : (
                <svg viewBox="0 0 320 140" className="w-full h-full" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="evalLine" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#a855f7" />
                    </linearGradient>
                  </defs>
                  <line x1="0" y1="70" x2="320" y2="70" stroke="#333" strokeDasharray="4 4" vectorEffect="non-scaling-stroke"/>
                  <polyline
                    fill="none"
                    stroke="url(#evalLine)"
                    strokeWidth="2"
                    points={chart.points}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
            </div>
          </div>
        )}
        {activeTab === 'moves' && (
          <MoveList moves={moves} />
        )}
      </div>
    </div>
  );
};

export default EvalMovePanel;
