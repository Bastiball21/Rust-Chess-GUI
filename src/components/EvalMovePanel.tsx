import React, { useMemo, useState } from 'react';
import { Activity, List, Clock } from 'lucide-react';
import { MoveList } from './MoveList';

interface EvalMovePanelProps {
  evalHistory: number[];
  currentEval: string;
  moves: string[];
  timeControl?: string; // New Prop
}

const EvalMovePanel: React.FC<EvalMovePanelProps> = ({ evalHistory, currentEval, moves, timeControl }) => {
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
    <div className="h-full flex flex-col bg-gray-800 text-white rounded-lg overflow-hidden border border-gray-700 shadow-lg">
      <div className="flex border-b border-gray-700 bg-gray-900">
        <button
          onClick={() => setActiveTab('eval')}
          className={`flex-1 py-2 text-sm font-bold flex items-center justify-center gap-2 ${
            activeTab === 'eval' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'
          }`}
        >
          <Activity size={14} /> Eval
        </button>
        <button
          onClick={() => setActiveTab('moves')}
          className={`flex-1 py-2 text-sm font-bold flex items-center justify-center gap-2 ${
            activeTab === 'moves' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'
          }`}
        >
          <List size={14} /> Moves
        </button>
      </div>

      <div className="flex-1 p-3 overflow-hidden">
        {activeTab === 'eval' && (
          <div className="h-full flex flex-col gap-3">
            <div className="flex items-center justify-between bg-gray-900/40 p-2 rounded">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Current eval</div>
                <div className="text-2xl font-bold font-mono text-blue-300">{currentEval}</div>
              </div>
              {timeControl && (
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold flex items-center justify-end gap-1">
                     <Clock size={10} /> TC
                  </div>
                  <div className="text-sm font-mono text-gray-300">{timeControl}</div>
                </div>
              )}
            </div>

            <div className="flex-1 bg-gray-900/60 rounded border border-gray-700 p-2 relative">
              {evalHistory.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-gray-500">
                  Waiting for evaluation data...
                </div>
              ) : (
                <svg viewBox="0 0 320 140" className="w-full h-full" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="evalLine" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#60a5fa" />
                      <stop offset="100%" stopColor="#a855f7" />
                    </linearGradient>
                  </defs>
                  {/* Zero Line */}
                  <line x1="0" y1="70" x2="320" y2="70" stroke="#334155" strokeDasharray="4 4" vectorEffect="non-scaling-stroke"/>
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
