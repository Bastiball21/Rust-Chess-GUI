import React from 'react';
import { StandingsEntry, ScheduledGame } from '../App';
import { Trophy, List, AlertTriangle, Activity, FileText } from 'lucide-react';

interface BottomPanelProps {
  standings: StandingsEntry[];
  schedule: ScheduledGame[];
  errors: any[]; // Or define TournamentError
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const BottomPanel: React.FC<BottomPanelProps> = ({ standings, schedule, errors, activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'standings', label: 'Standings', icon: <Trophy size={14} /> },
    { id: 'schedule', label: 'Schedule', icon: <List size={14} /> },
    { id: 'crashes', label: 'Crash Info', icon: <AlertTriangle size={14} /> },
    { id: 'stats', label: 'Event Stats', icon: <Activity size={14} /> },
    { id: 'livelog', label: 'Livelog', icon: <FileText size={14} /> },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-800 text-white rounded-t-lg overflow-hidden border-t border-gray-700">
       {/* Tab Header */}
       <div className="flex bg-gray-900 border-b border-gray-700">
           {tabs.map(tab => (
               <button key={tab.id}
                       onClick={() => setActiveTab(tab.id)}
                       className={`px-4 py-2 text-sm font-bold flex items-center gap-2 border-r border-gray-800 transition-colors ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                   {tab.icon} {tab.label}
               </button>
           ))}
       </div>

       {/* Content */}
       <div className="flex-1 overflow-auto bg-gray-800 p-0">
           {activeTab === 'standings' && (
               <table className="w-full text-left text-sm border-collapse">
                   <thead className="bg-gray-900 text-gray-400 sticky top-0 z-10">
                       <tr>
                           <th className="p-3">Rank</th>
                           <th className="p-3">Engine</th>
                           <th className="p-3">Games</th>
                           <th className="p-3">Points</th>
                           <th className="p-3">%</th>
                           <th className="p-3">Wins</th>
                           <th className="p-3">Losses</th>
                           <th className="p-3">Draws</th>
                           <th className="p-3">SB</th>
                           <th className="p-3">Elo</th>
                           <th className="p-3">Crashes</th>
                       </tr>
                   </thead>
                   <tbody>
                       {standings.map((entry, idx) => (
                           <tr key={entry.engine_name} className={`border-b border-gray-700 hover:bg-gray-700/50 ${idx % 2 === 0 ? 'bg-gray-800' : 'bg-gray-800/50'}`}>
                               <td className="p-3 font-mono text-gray-400">{entry.rank}</td>
                               <td className="p-3 font-bold text-white flex items-center gap-2">
                                   {/* If we had logos here we'd show them, for now just name */}
                                   {entry.engine_name}
                               </td>
                               <td className="p-3">{entry.games_played}</td>
                               <td className="p-3 font-bold text-yellow-400">{entry.points}</td>
                               <td className="p-3 text-gray-300">{entry.score_percent.toFixed(1)}%</td>
                               <td className="p-3 text-green-400">{entry.wins}</td>
                               <td className="p-3 text-red-400">{entry.losses}</td>
                               <td className="p-3 text-blue-300">{entry.draws}</td>
                               <td className="p-3 font-mono text-gray-400">{entry.sb.toFixed(2)}</td>
                               <td className="p-3 font-mono">{entry.elo > 900 ? "Active" : entry.elo.toFixed(0)}</td>
                               <td className="p-3 text-red-500">{entry.crashes > 0 ? entry.crashes : '-'}</td>
                           </tr>
                       ))}
                       {standings.length === 0 && (
                           <tr><td colSpan={11} className="p-8 text-center text-gray-500">No standings available yet.</td></tr>
                       )}
                   </tbody>
               </table>
           )}

           {activeTab === 'schedule' && (
               <div className="p-0">
                   {/* Reusing existing schedule logic or list but cleaner */}
                   <table className="w-full text-left text-sm">
                       <thead className="bg-gray-900 text-gray-400 sticky top-0">
                           <tr>
                               <th className="p-3">ID</th>
                               <th className="p-3">White</th>
                               <th className="p-3">Black</th>
                               <th className="p-3">Result</th>
                               <th className="p-3">State</th>
                           </tr>
                       </thead>
                       <tbody>
                           {schedule.map(game => (
                               <tr key={game.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                                   <td className="p-3 font-mono text-gray-500">{game.id}</td>
                                   <td className="p-3">{game.white_name}</td>
                                   <td className="p-3">{game.black_name}</td>
                                   <td className="p-3 font-bold text-blue-300">{game.result || "*"}</td>
                                   <td className={`p-3 ${game.state === 'Active' ? 'text-green-400 animate-pulse' : 'text-gray-400'}`}>{game.state}</td>
                               </tr>
                           ))}
                       </tbody>
                   </table>
               </div>
           )}

           {activeTab === 'crashes' && (
               <div className="p-4 space-y-2">
                   {errors.length === 0 ? (
                       <div className="text-gray-500 text-center">No crashes reported.</div>
                   ) : (
                       errors.map((err, idx) => (
                           <div key={idx} className="bg-red-900/20 border border-red-900/50 p-3 rounded text-red-300 text-sm">
                               <div className="font-bold flex justify-between">
                                   <span>{err.engine_name}</span>
                                   <span className="text-xs opacity-70">Game {err.game_id || "?"}</span>
                               </div>
                               <div>{err.message}</div>
                           </div>
                       ))
                   )}
               </div>
           )}

           {/* Placeholders for others */}
           {['stats', 'livelog'].includes(activeTab) && (
               <div className="p-8 text-center text-gray-500">
                   {activeTab === 'stats' ? "Event statistics visualization coming soon." : "Live log output coming soon."}
               </div>
           )}
       </div>
    </div>
  );
};

export default BottomPanel;
