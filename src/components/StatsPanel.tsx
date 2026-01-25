import React, { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { EngineStats, GameUpdate } from '../App'; // We might need to extract types to a common file if circular deps arise
import { Activity, Cpu, Layers, Zap, Clock, Hash } from 'lucide-react';
import { PvBoard } from './PvBoard';

interface StatsPanelProps {
  gameUpdate: GameUpdate | null;
  whiteStats: EngineStats | null;
  blackStats: EngineStats | null;
  whiteName: string;
  blackName: string;
  whiteLogo?: string;
  blackLogo?: string;
}

const StatsPanel: React.FC<StatsPanelProps> = ({
    gameUpdate, whiteStats, blackStats, whiteName, blackName, whiteLogo, blackLogo
}) => {
  const [activeTab, setActiveTab] = useState<'engine' | 'pv'>('engine');

  const buildPvTable = (pv: string, fen: string) => {
      const rows: { moveNumber: number; white?: string; black?: string }[] = [];
      if (!pv || !fen) return rows;
      try {
          const game = new Chess(fen === "start" ? undefined : fen);
          const fenParts = fen.split(' ');
          let fullMove = Number.parseInt(fenParts[5] ?? "1", 10) || 1;
          const moves = pv.split(/\s+/).filter(Boolean);
          for (const move of moves) {
              if (move === "0000") continue;
              if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) break;
              const from = move.slice(0, 2);
              const to = move.slice(2, 4);
              const promotion = move.length > 4 ? move.slice(4) : undefined;
              const applied = game.move({ from, to, promotion });
              if (!applied) break;
              if (applied.color === 'w') {
                  rows.push({ moveNumber: fullMove, white: applied.san });
              } else {
                  if (rows.length === 0 || rows[rows.length - 1].black) {
                      rows.push({ moveNumber: fullMove });
                  }
                  rows[rows.length - 1].black = applied.san;
                  fullMove += 1;
              }
          }
      } catch (e) {
          return [];
      }
      return rows;
  };

  // Helper to format score
  const formatScore = (cp?: number | null, mate?: number | null) => {
      if (mate !== undefined && mate !== null) return `M${mate}`;
      if (cp !== undefined && cp !== null) return (cp / 100).toFixed(2);
      return "0.00";
  };

  const activeColor = gameUpdate ? (gameUpdate.fen.split(' ')[1] === 'w' ? 'white' : 'black') : 'white';
  const activeStats = activeColor === 'white' ? whiteStats : blackStats;
  const isWhite = activeColor === 'white';
  const pvRows = useMemo(() => {
      if (!activeStats?.pv || !gameUpdate?.fen) return [];
      return buildPvTable(activeStats.pv, gameUpdate.fen);
  }, [activeStats?.pv, gameUpdate?.fen]);

  return (
    <div className="h-full flex flex-col bg-gray-800 text-white rounded-lg overflow-hidden border border-gray-700 shadow-lg">
      {/* Top Header: Tabs */}
      <div className="flex border-b border-gray-700 bg-gray-900">
          <button onClick={() => setActiveTab('engine')}
                  className={`flex-1 py-2 text-sm font-bold ${activeTab === 'engine' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              Engine
          </button>
          <button onClick={() => setActiveTab('pv')}
                  className={`flex-1 py-2 text-sm font-bold ${activeTab === 'pv' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              PV
          </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col p-4 gap-6 overflow-y-auto">

          {/* Engine Info Cards */}
          <div className="grid grid-cols-2 gap-4">
               {/* White Engine */}
               <div className={`flex flex-col items-center p-3 rounded-lg border-2 transition-colors ${activeColor === 'white' ? 'border-blue-500 bg-gray-700/50' : 'border-transparent bg-gray-700/20'}`}>
                   <div className="w-12 h-12 mb-2 bg-gray-600 rounded-full flex items-center justify-center overflow-hidden">
                       {whiteLogo ? <img src={`https://asset.localhost/${whiteLogo}`} className="w-full h-full object-contain"/> : <span className="text-xs">W</span>}
                   </div>
                   <span className="font-bold text-sm text-center truncate w-full">{whiteName}</span>
                   <span className="text-xs text-gray-400 font-mono">
                       {whiteStats?.depth || 0}/{whiteStats?.nodes ? (whiteStats.nodes / 1_000_000).toFixed(1) + 'M' : '0'}
                   </span>
                   <div className="mt-2 text-2xl font-bold font-mono">
                       {formatScore(whiteStats?.score_cp, whiteStats?.score_mate)}
                   </div>
                   <div className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                       <Clock size={12}/> {((gameUpdate?.white_time || 0) / 1000).toFixed(1)}s
                   </div>
               </div>

               {/* Black Engine */}
               <div className={`flex flex-col items-center p-3 rounded-lg border-2 transition-colors ${activeColor === 'black' ? 'border-blue-500 bg-gray-700/50' : 'border-transparent bg-gray-700/20'}`}>
                   <div className="w-12 h-12 mb-2 bg-gray-600 rounded-full flex items-center justify-center overflow-hidden">
                       {blackLogo ? <img src={`https://asset.localhost/${blackLogo}`} className="w-full h-full object-contain"/> : <span className="text-xs">B</span>}
                   </div>
                   <span className="font-bold text-sm text-center truncate w-full">{blackName}</span>
                   <span className="text-xs text-gray-400 font-mono">
                       {blackStats?.depth || 0}/{blackStats?.nodes ? (blackStats.nodes / 1_000_000).toFixed(1) + 'M' : '0'}
                   </span>
                   <div className="mt-2 text-2xl font-bold font-mono">
                       {formatScore(blackStats?.score_cp, blackStats?.score_mate)}
                   </div>
                   <div className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                       <Clock size={12}/> {((gameUpdate?.black_time || 0) / 1000).toFixed(1)}s
                   </div>
               </div>
          </div>

          {/* Active Stats Details */}
          {activeTab === 'engine' && (
              <div className="space-y-4">
                  <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
                      <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Analysis</h4>
                      <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
                          <div className="flex justify-between">
                              <span className="text-gray-500 flex items-center gap-2"><Layers size={14}/> Depth</span>
                              <span className="font-mono text-white">{activeStats?.depth || 0}</span>
                          </div>
                          <div className="flex justify-between">
                              <span className="text-gray-500 flex items-center gap-2"><Zap size={14}/> NPS</span>
                              <span className="font-mono text-white">{activeStats?.nps ? (activeStats.nps / 1000).toFixed(0) + 'k' : '0'}</span>
                          </div>
                          <div className="flex justify-between">
                              <span className="text-gray-500 flex items-center gap-2"><Cpu size={14}/> Nodes</span>
                              <span className="font-mono text-white">{activeStats?.nodes ? (activeStats.nodes / 1_000_000).toFixed(2) + 'M' : '0'}</span>
                          </div>
                          <div className="flex justify-between">
                              <span className="text-gray-500 flex items-center gap-2"><Hash size={14}/> Hash</span>
                              <span className="font-mono text-white">{activeStats?.hash_full ? (activeStats.hash_full / 10).toFixed(1) + '%' : '-'}</span>
                          </div>
                          <div className="flex justify-between col-span-2">
                               <span className="text-gray-500 flex items-center gap-2"><Activity size={14}/> TB Hits</span>
                               <span className="font-mono text-white">{activeStats?.tb_hits || 0}</span>
                          </div>
                      </div>
                  </div>

                  <div className="bg-gray-900/50 p-3 rounded border border-gray-700 flex-1">
                      <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Principal Variation</h4>
                      <p className="text-xs font-mono text-gray-300 break-words leading-relaxed">
                          {activeStats?.pv || "Thinking..."}
                      </p>
                  </div>
              </div>
          )}

          {activeTab === 'pv' && (
              <div className="flex-1 bg-gray-900/50 rounded border border-gray-700 p-4 flex flex-col gap-4">
                  <div className="flex flex-col items-center">
                      <div className="w-[200px] h-[200px] pointer-events-none opacity-80">
                           {/* Mini PV Board Visualization */}
                           {activeStats?.pv && gameUpdate?.fen ? (
                               <PvBoard pv={activeStats.pv} currentFen={gameUpdate.fen} side={activeColor} />
                           ) : (
                               <span className="text-xs text-gray-500">No PV available</span>
                           )}
                      </div>
                      <div className="mt-4 text-center">
                          <div className="text-2xl font-bold font-mono text-blue-400">
                              {formatScore(activeStats?.score_cp, activeStats?.score_mate)}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">Evaluation</div>
                      </div>
                  </div>
                  <div className="flex-1 min-h-0">
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">PV Table</div>
                      <div className="border border-gray-700 rounded bg-gray-900/60 h-full overflow-y-auto">
                          {pvRows.length === 0 ? (
                              <div className="p-4 text-center text-xs text-gray-500">No PV available</div>
                          ) : (
                              <table className="w-full text-xs text-left">
                                  <thead className="sticky top-0 bg-gray-900 text-gray-400">
                                      <tr>
                                          <th className="p-2 w-12">#</th>
                                          <th className="p-2">White</th>
                                          <th className="p-2">Black</th>
                                      </tr>
                                  </thead>
                                  <tbody>
                                      {pvRows.map((row) => (
                                          <tr key={`${row.moveNumber}-${row.white || ''}-${row.black || ''}`} className="border-b border-gray-800">
                                              <td className="p-2 font-mono text-gray-500">{row.moveNumber}</td>
                                              <td className="p-2 font-mono text-blue-200">{row.white || '-'}</td>
                                              <td className="p-2 font-mono text-blue-200">{row.black || '-'}</td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          )}
                      </div>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};

export default StatsPanel;
