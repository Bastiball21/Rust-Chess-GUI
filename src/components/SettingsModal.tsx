import React from 'react';
import { X, Plus, Trash2, RefreshCw, FileText, MoreHorizontal } from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';

interface EngineConfig {
  id?: string;
  name: string;
  path: string;
  options: [string, string][];
  protocol?: string;
  logo_path?: string;
}

interface AdjudicationConfig {
  resign_score: number | null;
  resign_move_count: number | null;
  draw_score: number | null;
  draw_move_number: number | null;
  draw_move_count: number | null;
  result_adjudication: boolean;
  syzygy_path: string | null;
}

interface OpeningConfig {
  file: string | null;
  fen: string | null;
  depth: number | null;
  order: string | null;
  book_path: string | null;
}

interface SprtSettings {
    enabled: boolean;
    h0Elo: number;
    h1Elo: number;
    drawRatio: number;
    alpha: number;
    beta: number;
}

interface TournamentSettings {
    mode: 'Match' | 'RoundRobin' | 'Gauntlet' | 'Swiss';
    gamesCount: number;
    swapSides: boolean;
    concurrency: number;
    timeControl: { baseMs: number; incMs: number };
    eventName: string;
    pgnPath: string;
    overwritePgn: boolean;
    variant: 'standard' | 'chess960';
    sprt: SprtSettings;
    disabledEngineIds: string[];
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'general' | 'engines' | 'tournaments';
  onStartMatch: () => void;
  engines: EngineConfig[];
  onUpdateEngines: (engines: EngineConfig[]) => void;
  adjudication: AdjudicationConfig;
  onUpdateAdjudication: (config: AdjudicationConfig) => void;
  opening: OpeningConfig;
  onUpdateOpening: (config: OpeningConfig) => void;
  tournamentSettings: TournamentSettings;
  onUpdateTournamentSettings: (settings: TournamentSettings) => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  initialTab = 'engines',
  onStartMatch,
  engines,
  onUpdateEngines,
  // adjudication,
  // onUpdateAdjudication,
  // opening,
  // onUpdateOpening,
  tournamentSettings,
  onUpdateTournamentSettings,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = React.useState(initialTab);

  React.useEffect(() => {
      if (isOpen) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  // --- HANDLERS ---
  const handleEngineChange = (index: number, field: keyof EngineConfig, value: string) => {
    const newEngines = [...engines];
    newEngines[index] = { ...newEngines[index], [field]: value };
    onUpdateEngines(newEngines);
  };

  const addEngine = () => {
    onUpdateEngines([
      ...engines,
      { id: crypto.randomUUID(), name: 'New Engine', path: '', options: [] },
    ]);
  };

  const removeEngine = (index: number) => {
    const newEngines = engines.filter((_, i) => i !== index);
    onUpdateEngines(newEngines);
  };

  // --- NEW: Handle PGN File Picker ---
  const handleBrowsePgnPath = async () => {
    try {
      const selected = await save({
        title: 'Save PGN File',
        defaultPath: tournamentSettings.pgnPath || 'tournament.pgn',
        filters: [{
          name: 'PGN Files',
          extensions: ['pgn']
        }]
      });

      if (selected) {
        onUpdateTournamentSettings({ ...tournamentSettings, pgnPath: selected });
      }
    } catch (err) {
      console.error('Failed to open save dialog:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#262421] w-[800px] h-[600px] rounded-lg shadow-2xl flex flex-col border border-[#3C3B39]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3C3B39]">
          <h2 className="text-xl font-bold text-gray-100">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-100">
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 py-2 bg-[#1b1b1b] gap-4 border-b border-[#3C3B39]">
          {(['engines', 'tournaments', 'general'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 text-gray-300">

          {/* --- ENGINES TAB --- */}
          {activeTab === 'engines' && (
            <div className="space-y-4">
              {engines.map((engine, idx) => (
                <div key={engine.id || idx} className="bg-[#1e1e1e] p-4 rounded border border-[#333] space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-gray-500 mb-1">Name</label>
                      <input
                        className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-sm text-white focus:border-blue-500 outline-none"
                        value={engine.name}
                        onChange={(e) => handleEngineChange(idx, 'name', e.target.value)}
                      />
                    </div>
                    <div className="flex-[2]">
                      <label className="block text-xs font-bold text-gray-500 mb-1">Executable Path</label>
                      <input
                        className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-sm text-gray-300 font-mono focus:border-blue-500 outline-none"
                        value={engine.path}
                        onChange={(e) => handleEngineChange(idx, 'path', e.target.value)}
                      />
                    </div>
                    <div className="pt-5">
                       <button onClick={() => removeEngine(idx)} className="text-red-500 hover:bg-red-500/10 p-1 rounded transition">
                         <Trash2 size={18} />
                       </button>
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={addEngine}
                className="w-full py-2 border-2 border-dashed border-[#444] text-gray-400 hover:border-blue-500 hover:text-blue-400 rounded flex items-center justify-center gap-2 font-bold transition-all"
              >
                <Plus size={18} /> Add Engine
              </button>
            </div>
          )}

          {/* --- TOURNAMENTS TAB --- */}
          {activeTab === 'tournaments' && (
            <div className="space-y-6">

              {/* Event & Output */}
              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Event Name</label>
                    <input
                       className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-sm outline-none focus:border-blue-500"
                       value={tournamentSettings.eventName}
                       onChange={e => onUpdateTournamentSettings({...tournamentSettings, eventName: e.target.value})}
                       placeholder="My Tournament"
                    />
                 </div>

                 {/* PGN Path with Triple Button */}
                 <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">PGN Output Path</label>
                    <div className="flex gap-2">
                        <input
                           className="flex-1 bg-[#111] border border-[#333] rounded px-2 py-1.5 text-sm font-mono text-gray-400 outline-none focus:border-blue-500"
                           value={tournamentSettings.pgnPath}
                           onChange={e => onUpdateTournamentSettings({...tournamentSettings, pgnPath: e.target.value})}
                        />
                        <button
                            onClick={handleBrowsePgnPath}
                            className="bg-[#333] hover:bg-[#444] text-gray-200 px-2 rounded border border-[#444] transition-colors"
                            title="Browse..."
                        >
                            <MoreHorizontal size={18} />
                        </button>
                    </div>
                 </div>
              </div>

              {/* Time Control */}
              <div className="bg-[#1e1e1e] p-4 rounded border border-[#333]">
                <h3 className="text-sm font-bold text-gray-100 mb-3 flex items-center gap-2">
                    <RefreshCw size={14} className="text-blue-400"/> Time Control
                </h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Base (ms)</label>
                        <input
                           type="number"
                           className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-sm font-mono"
                           value={tournamentSettings.timeControl.baseMs}
                           onChange={e => onUpdateTournamentSettings({
                               ...tournamentSettings,
                               timeControl: {...tournamentSettings.timeControl, baseMs: parseInt(e.target.value) || 0}
                           })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Increment (ms)</label>
                        <input
                           type="number"
                           className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-sm font-mono"
                           value={tournamentSettings.timeControl.incMs}
                           onChange={e => onUpdateTournamentSettings({
                               ...tournamentSettings,
                               timeControl: {...tournamentSettings.timeControl, incMs: parseInt(e.target.value) || 0}
                           })}
                        />
                    </div>
                </div>
              </div>

              {/* Game Rules */}
              <div className="bg-[#1e1e1e] p-4 rounded border border-[#333]">
                 <h3 className="text-sm font-bold text-gray-100 mb-3 flex items-center gap-2">
                    <FileText size={14} className="text-green-400"/> Rules & Format
                 </h3>
                 <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs text-gray-500 mb-1">Game Count</label>
                        <input
                           type="number"
                           className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-sm"
                           value={tournamentSettings.gamesCount}
                           onChange={e => onUpdateTournamentSettings({...tournamentSettings, gamesCount: parseInt(e.target.value) || 1})}
                        />
                     </div>
                     <div className="flex items-center gap-2 mt-5">
                         <input
                            type="checkbox"
                            checked={tournamentSettings.swapSides}
                            onChange={e => onUpdateTournamentSettings({...tournamentSettings, swapSides: e.target.checked})}
                            className="rounded bg-[#111] border-[#333]"
                         />
                         <span className="text-sm text-gray-300">Swap Sides</span>
                     </div>
                 </div>
              </div>

            </div>
          )}

          {/* --- GENERAL TAB --- */}
          {activeTab === 'general' && (
            <div className="text-center text-gray-500 py-10">
              <p>General application settings (Appearance, Sounds) can go here.</p>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#3C3B39] bg-[#1b1b1b] flex justify-end gap-3">
           <button
             onClick={onClose}
             className="px-4 py-2 rounded text-sm font-bold text-gray-400 hover:text-white hover:bg-white/5 transition"
           >
             Cancel
           </button>
           <button
             onClick={() => { onStartMatch(); onClose(); }}
             className="px-6 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-900/20 transition"
           >
             Start Match
           </button>
        </div>

      </div>
    </div>
  );
}
