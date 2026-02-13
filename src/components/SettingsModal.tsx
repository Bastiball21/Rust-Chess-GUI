import React from 'react';
import { X, Plus, Trash2, FileText, MoreHorizontal, Clock } from 'lucide-react';
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

  // --- TIME CONTROL LOGIC ---
  const baseMinutes = Math.floor(tournamentSettings.timeControl.baseMs / 60000);
  const baseSeconds = Math.floor((tournamentSettings.timeControl.baseMs % 60000) / 1000);
  const incrementSeconds = tournamentSettings.timeControl.incMs / 1000;

  const updateBaseTime = (minutes: number, seconds: number) => {
      const totalMs = (minutes * 60000) + (seconds * 1000);
      onUpdateTournamentSettings({
          ...tournamentSettings,
          timeControl: { ...tournamentSettings.timeControl, baseMs: totalMs }
      });
  };

  const updateIncrement = (seconds: number) => {
      onUpdateTournamentSettings({
          ...tournamentSettings,
          timeControl: { ...tournamentSettings.timeControl, incMs: Math.round(seconds * 1000) }
      });
  };

  // New: Apply Presets (Bullet, Blitz, Rapid)
  const applyPreset = (minutes: number, increment: number) => {
      const totalMs = minutes * 60000;
      const incMs = increment * 1000;
      onUpdateTournamentSettings({
          ...tournamentSettings,
          timeControl: { baseMs: totalMs, incMs: incMs }
      });
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

              {/* Time Control (Cutechess-Inspired Style) */}
              <div className="bg-[#1e1e1e] rounded border border-[#333] overflow-hidden">
                <div className="bg-[#252525] px-4 py-2 border-b border-[#333] flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                        <Clock size={14} className="text-blue-400"/> Time Control
                    </h3>

                    {/* Presets Dropdown */}
                    <select
                        className="bg-[#111] border border-[#333] text-xs text-gray-400 rounded px-2 py-1 outline-none focus:border-blue-500"
                        onChange={(e) => {
                            const [m, i] = e.target.value.split(',').map(Number);
                            applyPreset(m, i);
                        }}
                        defaultValue=""
                    >
                        <option value="" disabled>Presets...</option>
                        <option value="1,0">Bullet (1+0)</option>
                        <option value="1,1">Bullet (1+1)</option>
                        <option value="3,0">Blitz (3+0)</option>
                        <option value="3,2">Blitz (3+2)</option>
                        <option value="5,0">Blitz (5+0)</option>
                        <option value="10,0">Rapid (10+0)</option>
                        <option value="10,5">Rapid (10+5)</option>
                    </select>
                </div>

                <div className="p-4">
                    <div className="flex items-center gap-4">
                        {/* Time Field */}
                        <div className="flex-1">
                            <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">Base Time</label>
                            <div className="flex items-center bg-[#111] border border-[#333] rounded p-1 group focus-within:border-blue-500 transition-colors">
                                <input
                                   type="number" min="0"
                                   className="w-12 bg-transparent text-right text-lg font-mono font-bold text-white outline-none placeholder-gray-700"
                                   placeholder="00"
                                   value={baseMinutes}
                                   onChange={e => updateBaseTime(parseInt(e.target.value) || 0, baseSeconds)}
                                />
                                <span className="text-gray-500 px-1 font-mono">:</span>
                                <input
                                   type="number" min="0" max="59"
                                   className="w-12 bg-transparent text-left text-lg font-mono font-bold text-white outline-none placeholder-gray-700"
                                   placeholder="00"
                                   value={baseSeconds.toString().padStart(2, '0')}
                                   onChange={e => updateBaseTime(baseMinutes, parseInt(e.target.value) || 0)}
                                />
                                <span className="text-xs text-gray-500 ml-auto px-2">min:sec</span>
                            </div>
                        </div>

                        {/* Separator */}
                        <div className="pt-5 text-gray-600 font-bold text-xl">+</div>

                        {/* Increment Field */}
                        <div className="flex-1">
                            <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">Increment</label>
                            <div className="flex items-center bg-[#111] border border-[#333] rounded p-1 group focus-within:border-blue-500 transition-colors">
                                <input
                                   type="number" min="0" step="0.1"
                                   className="w-full bg-transparent text-center text-lg font-mono font-bold text-white outline-none"
                                   value={incrementSeconds}
                                   onChange={e => updateIncrement(parseFloat(e.target.value) || 0)}
                                />
                                <span className="text-xs text-gray-500 px-2 absolute right-8 pointer-events-none">sec</span>
                            </div>
                        </div>
                    </div>

                    <p className="text-[10px] text-gray-500 mt-2 text-center">
                        Format: <span className="text-gray-400">Time per game</span> + <span className="text-gray-400">Increment per move</span>
                    </p>
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
