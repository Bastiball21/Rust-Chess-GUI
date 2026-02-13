import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Copy, Settings, RefreshCw, X } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

interface UciOption {
  name: string;
  option_type: string;
  default: string | null;
  min: number | null;
  max: number | null;
  var: string[];
}

interface EngineConfig {
  id?: string;
  name: string;
  path: string;
  options: [string, string][]; // Stored as tuple array
  country_code?: string;
  args?: string[];
  working_directory?: string;
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
  onStartMatch?: () => void;
  engines: EngineConfig[];
  onUpdateEngines: (engines: EngineConfig[]) => void;
  adjudication: AdjudicationConfig;
  onUpdateAdjudication: (adj: AdjudicationConfig) => void;
  opening: OpeningConfig;
  onUpdateOpening: (op: OpeningConfig) => void;
  tournamentSettings: TournamentSettings;
  onUpdateTournamentSettings: (settings: TournamentSettings) => void;
}

// Sub-component for Engine Edit
const EngineEditor: React.FC<{
  engine: EngineConfig;
  onSave: (eng: EngineConfig) => void;
  onCancel: () => void;
}> = ({ engine, onSave, onCancel }) => {
  const [localEngine, setLocalEngine] = useState(engine);
  const [detectedOptions, setDetectedOptions] = useState<UciOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Convert tuple array to object for easier editing
  const [optionValues, setOptionValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const opts: Record<string, string> = {};
    localEngine.options.forEach(([k, v]) => {
      opts[k] = v;
    });
    setOptionValues(opts);
  }, [localEngine.options]);


  const detectOptions = async () => {
    if (!localEngine.path) return;
    setLoadingOptions(true);
    try {
      const opts = await invoke<UciOption[]>('query_engine_options', { path: localEngine.path });
      setDetectedOptions(opts);
    } catch (e) {
      alert("Failed to query engine options: " + e);
    } finally {
      setLoadingOptions(false);
    }
  };

  const handleOptionChange = (name: string, value: string) => {
    setOptionValues(prev => ({ ...prev, [name]: value }));
  };

  const save = () => {
    // Convert back to tuple array
    const optsArray: [string, string][] = Object.entries(optionValues).map(([k, v]) => [k, v]);
    onSave({ ...localEngine, options: optsArray });
  };

  const selectLogo = async () => {
      const selected = await open({ multiple: false, filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'svg'] }] });
      if (selected && typeof selected === 'string') {
          setLocalEngine(prev => ({ ...prev, logo_path: selected }));
      }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-3xl h-[80vh] flex flex-col border border-gray-600 shadow-xl">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-lg">
          <h3 className="text-lg font-bold text-white">Edit Engine: {localEngine.name}</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-white"><X size={20}/></button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Name</label>
                    <input className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                           value={localEngine.name} onChange={e => setLocalEngine({...localEngine, name: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Executable</label>
                    <div className="flex gap-2">
                        <input className="flex-1 bg-gray-700 border border-gray-600 rounded p-2 text-xs font-mono text-gray-300"
                               value={localEngine.path} readOnly />
                    </div>
                </div>
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Logo</label>
                    <div className="flex gap-2 items-center">
                        {localEngine.logo_path && <img src={`https://asset.localhost/${localEngine.logo_path}`} className="w-8 h-8 object-contain" />}
                        <button onClick={selectLogo} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs border border-gray-600">Choose...</button>
                        {localEngine.logo_path && <span className="text-xs text-gray-500 truncate flex-1">{localEngine.logo_path}</span>}
                    </div>
                </div>
                <div>
                     <label className="block text-xs text-gray-400 mb-1">Protocol</label>
                     <select className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                             value={localEngine.protocol || 'uci'} onChange={e => setLocalEngine({...localEngine, protocol: e.target.value})}>
                         <option value="uci">UCI</option>
                         <option value="xboard">WinBoard / XBoard (Experimental)</option>
                     </select>
                </div>
            </div>

            {/* UCI Options */}
            <div className="border border-gray-700 rounded bg-gray-900/50 p-4">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-sm text-gray-300">Engine Options</h4>
                    <button onClick={detectOptions} disabled={loadingOptions}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-xs font-bold disabled:opacity-50">
                        {loadingOptions ? <RefreshCw size={14} className="animate-spin"/> : <Settings size={14}/>}
                        {detectedOptions.length > 0 ? "Re-Detect" : "Detect Options"}
                    </button>
                </div>

                {detectedOptions.length === 0 ? (
                    <div className="text-center text-gray-500 py-8 text-sm">
                        Click "Detect Options" to load available settings from the engine.
                        <br/>
                        <span className="text-xs opacity-70">Or manually add them below (Advanced)</span>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-gray-800 text-gray-400">
                                <tr>
                                    <th className="p-2">Name</th>
                                    <th className="p-2">Value</th>
                                    <th className="p-2">Default</th>
                                </tr>
                            </thead>
                            <tbody>
                                {detectedOptions.map(opt => {
                                    if (opt.name === "UCI_Chess960") return null; // Handled by config
                                    const val = optionValues[opt.name] ?? opt.default ?? "";
                                    return (
                                        <tr key={opt.name} className="border-b border-gray-800 hover:bg-gray-800/50">
                                            <td className="p-2 font-mono text-blue-300">{opt.name}</td>
                                            <td className="p-2">
                                                {opt.option_type === 'check' ? (
                                                    <input type="checkbox" checked={val === 'true'}
                                                           onChange={e => handleOptionChange(opt.name, String(e.target.checked))} />
                                                ) : opt.option_type === 'spin' ? (
                                                    <input type="number" className="bg-gray-700 w-20 p-1 rounded border border-gray-600"
                                                           value={val} min={opt.min ?? undefined} max={opt.max ?? undefined}
                                                           onChange={e => handleOptionChange(opt.name, e.target.value)} />
                                                ) : opt.option_type === 'combo' ? (
                                                    <select className="bg-gray-700 p-1 rounded border border-gray-600 w-full max-w-[150px]"
                                                            value={val} onChange={e => handleOptionChange(opt.name, e.target.value)}>
                                                        {(opt.var || []).map(v => <option key={v} value={v}>{v}</option>)}
                                                    </select>
                                                ) : opt.option_type === 'button' ? (
                                                    <button className="bg-gray-700 px-2 py-1 rounded text-[10px] text-gray-400 cursor-not-allowed">Action</button>
                                                ) : (
                                                    <input type="text" className="bg-gray-700 w-full p-1 rounded border border-gray-600"
                                                           value={val} onChange={e => handleOptionChange(opt.name, e.target.value)} />
                                                )}
                                            </td>
                                            <td className="p-2 text-gray-500">{opt.default}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>

        <div className="p-4 border-t border-gray-700 flex justify-end gap-2 bg-gray-900 rounded-b-lg">
            <button onClick={onCancel} className="px-4 py-2 text-gray-300 hover:text-white">Cancel</button>
            <button onClick={save} className="px-6 py-2 bg-green-600 hover:bg-green-500 rounded font-bold text-white flex items-center gap-2">
                <Save size={16}/> Save Engine
            </button>
        </div>
      </div>
    </div>
  );
};

const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen, onClose, initialTab, onStartMatch,
    engines, onUpdateEngines,
    adjudication, onUpdateAdjudication,
    opening, onUpdateOpening,
    tournamentSettings, onUpdateTournamentSettings
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'engines' | 'tournaments'>('engines');
  const [editingEngineIdx, setEditingEngineIdx] = useState<number | null>(null);
  const [engineCheckRunning, setEngineCheckRunning] = useState(false);
  const [engineCheckResults, setEngineCheckResults] = useState<Array<{
      id: string;
      name: string;
      ok: boolean;
      message?: string;
  }>>([]);

  // General Settings State
  const [generalSettings, setGeneralSettings] = useState({
      highlightLegalMoves: localStorage.getItem('pref_highlight_legal') === 'true',
      showArrows: localStorage.getItem('pref_show_arrows') !== 'false', // Default true
  });

  const updateGeneral = (key: string, val: boolean) => {
      if (key === 'highlightLegalMoves') localStorage.setItem('pref_highlight_legal', String(val));
      if (key === 'showArrows') localStorage.setItem('pref_show_arrows', String(val));
      setGeneralSettings(prev => ({ ...prev, [key]: val }));
      // Dispatch event for live update
      window.dispatchEvent(new Event('storage'));
  };

  const updateTournament = (updates: Partial<TournamentSettings>) => {
      onUpdateTournamentSettings({ ...tournamentSettings, ...updates });
  };

  const disabledEngineIds = tournamentSettings.disabledEngineIds ?? [];
  const enabledEngines = engines.filter(engine => !disabledEngineIds.includes(engine.id ?? ''));

  useEffect(() => {
      if (isOpen && initialTab) {
          setActiveTab(initialTab);
      }
  }, [initialTab, isOpen]);

  useEffect(() => {
      setEngineCheckResults([]);
  }, [engines]);

  const runEngineCheck = async () => {
      if (enabledEngines.length === 0) return;
      setEngineCheckRunning(true);
      const results: Array<{ id: string; name: string; ok: boolean; message?: string }> = [];
      for (const engine of enabledEngines) {
          try {
              await invoke<UciOption[]>('query_engine_options', { path: engine.path });
              results.push({ id: engine.id || engine.name, name: engine.name, ok: true });
          } catch (error) {
              results.push({
                  id: engine.id || engine.name,
                  name: engine.name,
                  ok: false,
                  message: String(error),
              });
          }
      }
      setEngineCheckResults(results);
      setEngineCheckRunning(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-8">
        {editingEngineIdx !== null && (
            <EngineEditor
                engine={engines[editingEngineIdx]}
                onSave={(updated) => {
                    const newEngines = [...engines];
                    newEngines[editingEngineIdx] = updated;
                    onUpdateEngines(newEngines);
                    setEditingEngineIdx(null);
                }}
                onCancel={() => setEditingEngineIdx(null)}
            />
        )}

        <div className="bg-gray-800 rounded-lg w-full max-w-5xl h-[85vh] flex flex-col border border-gray-600 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-gray-900 p-4 border-b border-gray-700 flex justify-between items-center">
                <div className="flex gap-4">
                    {['general', 'engines', 'tournaments'].map(tab => (
                        <button key={tab}
                                onClick={() => setActiveTab(tab as any)}
                                className={`px-4 py-2 rounded font-bold capitalize transition-colors ${activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                            {tab}
                        </button>
                    ))}
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={24}/></button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto bg-gray-800 p-6">

                {activeTab === 'general' && (
                    <div className="space-y-6 max-w-xl">
                        <h3 className="text-xl font-bold text-white mb-4">Board Settings</h3>
                        <label className="flex items-center gap-3 p-3 bg-gray-700/50 rounded cursor-pointer hover:bg-gray-700">
                            <input type="checkbox" className="w-5 h-5 accent-blue-500"
                                   checked={generalSettings.highlightLegalMoves}
                                   onChange={e => updateGeneral('highlightLegalMoves', e.target.checked)} />
                            <span className="text-gray-200">Highlight legal moves</span>
                        </label>
                        <label className="flex items-center gap-3 p-3 bg-gray-700/50 rounded cursor-pointer hover:bg-gray-700">
                            <input type="checkbox" className="w-5 h-5 accent-blue-500"
                                   checked={generalSettings.showArrows}
                                   onChange={e => updateGeneral('showArrows', e.target.checked)} />
                            <span className="text-gray-200">Show move arrows (PV)</span>
                        </label>
                    </div>
                )}

                {activeTab === 'engines' && (
                    <div className="h-full flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-white">Configured Engines</h3>
                            <div className="flex gap-2">
                                <button onClick={async () => {
                                    const selected = await open({ multiple: false, filters: [{ name: 'Executables', extensions: ['exe', ''] }] });
                                    if (selected && typeof selected === 'string') {
                                        const name = selected.split(/[\\/]/).pop() || "New Engine";
                                        const newEng = { id: crypto.randomUUID(), name, path: selected, options: [] as [string, string][] };
                                        onUpdateEngines([...engines, newEng]);
                                    }
                                }} className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded flex items-center gap-2 text-sm font-bold">
                                    <Plus size={16}/> Add Engine
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto border border-gray-700 rounded bg-gray-900/30">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-700 text-gray-300 sticky top-0">
                                    <tr>
                                        <th className="p-3">Engine</th>
                                        <th className="p-3">Path</th>
                                        <th className="p-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {engines.map((eng, idx) => (
                                        <tr key={eng.id || idx} className="border-b border-gray-700 hover:bg-gray-700/40">
                                            <td className="p-3 flex items-center gap-3">
                                                {eng.logo_path ? <img src={`https://asset.localhost/${eng.logo_path}`} className="w-6 h-6 object-contain"/> : <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center text-[10px]">?</div>}
                                                <span className="font-bold text-white">{eng.name}</span>
                                            </td>
                                            <td className="p-3 text-gray-400 text-xs font-mono truncate max-w-[200px]">{eng.path}</td>
                                            <td className="p-3 text-right flex justify-end gap-2">
                                                <button onClick={() => setEditingEngineIdx(idx)} className="p-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white rounded" title="Configure">
                                                    <Settings size={16}/>
                                                </button>
                                                <button onClick={() => {
                                                    const copy = { ...eng, id: crypto.randomUUID(), name: eng.name + " (Copy)" };
                                                    onUpdateEngines([...engines, copy]);
                                                }} className="p-1.5 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded" title="Duplicate">
                                                    <Copy size={16}/>
                                                </button>
                                                <button onClick={() => {
                                                     const newEngs = [...engines];
                                                     newEngs.splice(idx, 1);
                                                     onUpdateEngines(newEngs);
                                                }} className="p-1.5 bg-red-900/20 text-red-400 hover:bg-red-900 hover:text-white rounded" title="Delete">
                                                    <Trash2 size={16}/>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {engines.length === 0 && (
                                        <tr><td colSpan={3} className="p-8 text-center text-gray-500">No engines added.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'tournaments' && (
                    <div className="space-y-6">
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="text-2xl font-bold text-white">Tournament Manager</h3>
                                <p className="text-sm text-gray-400">
                                    Set up a quick test or a full tournament before the first game starts.
                                </p>
                            </div>
                            <div className="text-right text-xs text-gray-400">
                                <div className="font-semibold text-gray-300">Ready check</div>
                                <div>
                                    {enabledEngines.length} of {engines.length} engine{engines.length === 1 ? '' : 's'} selected
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-6">
                            <div className="col-span-2 space-y-6">
                                <section className="bg-gray-900/40 p-4 rounded border border-gray-700 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-lg text-blue-400">Basics</h4>
                                        <label className="flex items-center gap-2 text-sm text-gray-300">
                                            <input
                                                type="checkbox"
                                                checked={tournamentSettings.swapSides}
                                                onChange={e => updateTournament({ swapSides: e.target.checked })}
                                            />
                                            Swap sides each game
                                        </label>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1">Event Name</label>
                                            <input
                                                className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                                                value={tournamentSettings.eventName}
                                                onChange={e => updateTournament({ eventName: e.target.value })}
                                                placeholder="Test run vs. nightly builds"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1">Mode</label>
                                            <select
                                                className="bg-gray-700 border border-gray-600 rounded p-2 w-full"
                                                value={tournamentSettings.mode}
                                                onChange={e => updateTournament({ mode: e.target.value as TournamentSettings['mode'] })}
                                            >
                                                <option value="Match">Match</option>
                                                <option value="RoundRobin">Round Robin</option>
                                                <option value="Gauntlet">Gauntlet</option>
                                                <option value="Swiss">Swiss</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1">Games</label>
                                            <input
                                                type="number"
                                                min={1}
                                                className="bg-gray-700 border border-gray-600 rounded p-2 w-full"
                                                value={tournamentSettings.gamesCount}
                                                onChange={e => updateTournament({ gamesCount: parseInt(e.target.value, 10) || 1 })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1">Concurrency</label>
                                            <input
                                                type="number"
                                                min={1}
                                                className="bg-gray-700 border border-gray-600 rounded p-2 w-full"
                                                value={tournamentSettings.concurrency}
                                                onChange={e => updateTournament({ concurrency: parseInt(e.target.value, 10) || 1 })}
                                            />
                                            <p className="text-[11px] text-gray-500 mt-1">
                                                Increase only if your machine can run multiple games.
                                            </p>
                                        </div>
                                    </div>
                                </section>

                                <section className="bg-gray-900/40 p-4 rounded border border-gray-700 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-lg text-green-400">Time Control</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {[
                                                { label: '1+0', baseMs: 60000, incMs: 0 },
                                                { label: '3+1', baseMs: 180000, incMs: 1000 },
                                                { label: '10+5', baseMs: 600000, incMs: 5000 },
                                            ].map(preset => (
                                                <button
                                                    key={preset.label}
                                                    type="button"
                                                    onClick={() => updateTournament({ timeControl: { baseMs: preset.baseMs, incMs: preset.incMs } })}
                                                    className="px-2 py-1 text-xs rounded border border-gray-600 text-gray-300 hover:bg-gray-700"
                                                >
                                                    {preset.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1">Base (sec)</label>
                                            <input
                                                type="number"
                                                min={1}
                                                className="bg-gray-700 border border-gray-600 rounded p-2 w-full"
                                                value={Math.round(tournamentSettings.timeControl.baseMs / 1000)}
                                                onChange={e => updateTournament({
                                                    timeControl: {
                                                        ...tournamentSettings.timeControl,
                                                        baseMs: (parseFloat(e.target.value) || 1) * 1000,
                                                    },
                                                })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1">Increment (sec)</label>
                                            <input
                                                type="number"
                                                min={0}
                                                step={0.1}
                                                className="bg-gray-700 border border-gray-600 rounded p-2 w-full"
                                                value={tournamentSettings.timeControl.incMs / 1000}
                                                onChange={e => updateTournament({
                                                    timeControl: {
                                                        ...tournamentSettings.timeControl,
                                                        incMs: (parseFloat(e.target.value) || 0) * 1000,
                                                    },
                                                })}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">PGN Output Path</label>
                                        <input
                                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                                            value={tournamentSettings.pgnPath}
                                            onChange={e => updateTournament({ pgnPath: e.target.value })}
                                            placeholder="tournament.pgn"
                                        />
                                        <label className="flex items-center gap-2 text-xs text-gray-400 mt-2">
                                            <input
                                                type="checkbox"
                                                checked={tournamentSettings.overwritePgn}
                                                onChange={e => updateTournament({ overwritePgn: e.target.checked })}
                                                className="accent-blue-500"
                                            />
                                            Overwrite PGN file (start fresh)
                                        </label>
                                    </div>
                                </section>

                                <section className="bg-gray-900/40 p-4 rounded border border-gray-700 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-lg text-blue-400">Games & Openings</h4>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1">Variant</label>
                                            <select
                                                className="bg-gray-700 border border-gray-600 rounded p-2 w-full"
                                                value={tournamentSettings.variant}
                                                onChange={e => updateTournament({ variant: e.target.value as TournamentSettings['variant'] })}
                                            >
                                                <option value="standard">Standard</option>
                                                <option value="chess960">Chess960</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <h5 className="font-bold text-sm text-gray-300">Opening Suite</h5>
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">FEN String</label>
                                                <input
                                                    className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                                                    placeholder="Paste FEN..."
                                                    value={opening.fen || ""}
                                                    onChange={e => onUpdateOpening({ ...opening, fen: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">PGN / EPD File</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        className="flex-1 bg-gray-700 border border-gray-600 rounded p-2 text-xs"
                                                        value={opening.file || ""}
                                                        readOnly
                                                        placeholder="No file selected"
                                                    />
                                                    <button
                                                        onClick={async () => {
                                                            const selected = await open({ filters: [{ name: 'Openings', extensions: ['pgn', 'epd'] }] });
                                                            if (selected && typeof selected === 'string') onUpdateOpening({ ...opening, file: selected });
                                                        }}
                                                        className="bg-gray-600 px-3 rounded hover:bg-gray-500"
                                                    >
                                                        Browse...
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs text-gray-400 mb-1">Book Depth (Plies)</label>
                                                    <input
                                                        type="number"
                                                        className="bg-gray-700 border border-gray-600 rounded p-2 w-full"
                                                        value={opening.depth || 0}
                                                        onChange={e => onUpdateOpening({ ...opening, depth: parseInt(e.target.value) || 0 })}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-400 mb-1">Order</label>
                                                    <select
                                                        className="bg-gray-700 border border-gray-600 rounded p-2 w-full"
                                                        value={opening.order || "sequential"}
                                                        onChange={e => onUpdateOpening({ ...opening, order: e.target.value })}
                                                    >
                                                        <option value="sequential">Sequential</option>
                                                        <option value="random">Random</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Opening Book (Polyglot)</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        className="flex-1 bg-gray-700 border border-gray-600 rounded p-2 text-xs"
                                                        value={opening.book_path || ""}
                                                        readOnly
                                                        placeholder="No .bin book selected"
                                                    />
                                                    <button
                                                        onClick={async () => {
                                                            const selected = await open({ filters: [{ name: 'Polyglot Book', extensions: ['bin'] }] });
                                                            if (selected && typeof selected === 'string') onUpdateOpening({ ...opening, book_path: selected });
                                                        }}
                                                        className="bg-gray-600 px-3 rounded hover:bg-gray-500"
                                                    >
                                                        Browse...
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <h5 className="font-bold text-sm text-gray-300">Adjudication</h5>
                                            <div className="bg-gray-900/40 p-3 rounded border border-gray-700">
                                                <h6 className="font-bold text-xs text-gray-300 mb-2">Draw Adjudication</h6>
                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    <label>Move Number:</label>
                                                    <input
                                                        type="number"
                                                        className="bg-gray-700 rounded p-1 w-full"
                                                        value={adjudication.draw_move_number || 40}
                                                        onChange={e => onUpdateAdjudication({ ...adjudication, draw_move_number: parseInt(e.target.value) })}
                                                    />

                                                    <label>Move Count:</label>
                                                    <input
                                                        type="number"
                                                        className="bg-gray-700 rounded p-1 w-full"
                                                        value={adjudication.draw_move_count || 20}
                                                        onChange={e => onUpdateAdjudication({ ...adjudication, draw_move_count: parseInt(e.target.value) })}
                                                    />

                                                    <label>Score (cp):</label>
                                                    <input
                                                        type="number"
                                                        className="bg-gray-700 rounded p-1 w-full"
                                                        value={adjudication.draw_score || 5}
                                                        onChange={e => onUpdateAdjudication({ ...adjudication, draw_score: parseInt(e.target.value) })}
                                                    />
                                                </div>
                                            </div>

                                            <div className="bg-gray-900/40 p-3 rounded border border-gray-700">
                                                <h6 className="font-bold text-xs text-gray-300 mb-2">Resign Adjudication</h6>
                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    <label>Move Count:</label>
                                                    <input
                                                        type="number"
                                                        className="bg-gray-700 rounded p-1 w-full"
                                                        value={adjudication.resign_move_count || 5}
                                                        onChange={e => onUpdateAdjudication({ ...adjudication, resign_move_count: parseInt(e.target.value) })}
                                                    />

                                                    <label>Score (cp):</label>
                                                    <input
                                                        type="number"
                                                        className="bg-gray-700 rounded p-1 w-full"
                                                        value={adjudication.resign_score || 600}
                                                        onChange={e => onUpdateAdjudication({ ...adjudication, resign_score: parseInt(e.target.value) })}
                                                    />
                                                </div>
                                            </div>

                                            <label className="flex items-center gap-2 text-sm text-gray-300">
                                                <input
                                                    type="checkbox"
                                                    checked={adjudication.result_adjudication}
                                                    onChange={e => onUpdateAdjudication({ ...adjudication, result_adjudication: e.target.checked })}
                                                />
                                                TB / Syzygy Adjudication
                                            </label>

                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Syzygy tablebases path</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        className="flex-1 bg-gray-700 border border-gray-600 rounded p-2 text-xs"
                                                        value={adjudication.syzygy_path || ""}
                                                        readOnly
                                                        placeholder="No path selected"
                                                    />
                                                    <button
                                                        onClick={async () => {
                                                            const selected = await open({ directory: true });
                                                            if (selected && typeof selected === 'string') {
                                                                onUpdateAdjudication({ ...adjudication, syzygy_path: selected });
                                                            }
                                                        }}
                                                        className="bg-gray-600 px-3 rounded hover:bg-gray-500"
                                                    >
                                                        Browse...
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            </div>

                            <aside className="space-y-6">
                                <section className="bg-gray-900/40 p-4 rounded border border-gray-700 space-y-3">
                                    <h4 className="font-bold text-lg text-purple-300">Engines</h4>
                                    <p className="text-xs text-gray-400">
                                        Choose which installed engines to include in this tournament.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={runEngineCheck}
                                        disabled={engineCheckRunning || enabledEngines.length === 0}
                                        className="w-full px-3 py-2 text-xs font-semibold rounded border border-gray-600 text-gray-200 hover:bg-gray-700 disabled:opacity-60"
                                    >
                                        {engineCheckRunning ? 'Checking engines…' : 'Run quick engine check'}
                                    </button>
                                    <div className="space-y-2 max-h-40 overflow-auto">
                                        {engines.length === 0 && (
                                            <div className="text-xs text-gray-500">No engines configured yet.</div>
                                        )}
                                        {engines.map(engine => {
                                            const engineId = engine.id;
                                            const isDisabled = engineId ? disabledEngineIds.includes(engineId) : false;
                                            return (
                                                <label key={engine.id || engine.name} className="flex items-center gap-2 text-sm text-gray-200">
                                                    <input
                                                        type="checkbox"
                                                        className="accent-blue-500"
                                                        checked={!isDisabled}
                                                        disabled={!engineId}
                                                        onChange={e => {
                                                            if (!engineId) return;
                                                            const nextDisabled = e.target.checked
                                                                ? disabledEngineIds.filter(id => id !== engineId)
                                                                : [...disabledEngineIds, engineId];
                                                            updateTournament({ disabledEngineIds: nextDisabled });
                                                        }}
                                                    />
                                                    {engine.logo_path ? (
                                                        <img
                                                            src={`https://asset.localhost/${engine.logo_path}`}
                                                            className="w-5 h-5 object-contain"
                                                        />
                                                    ) : (
                                                        <div className="w-5 h-5 rounded-full bg-gray-700 text-[10px] flex items-center justify-center">
                                                            ?
                                                        </div>
                                                    )}
                                                    <span className={`truncate ${isDisabled ? 'text-gray-500' : ''}`}>{engine.name}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                    {engineCheckResults.length > 0 && (
                                        <div className="space-y-2">
                                            {engineCheckResults.map(result => (
                                                <div
                                                    key={result.id}
                                                    className={`text-xs rounded border px-2 py-1 ${
                                                        result.ok
                                                            ? 'border-emerald-700/60 text-emerald-200 bg-emerald-900/20'
                                                            : 'border-rose-700/60 text-rose-200 bg-rose-900/20'
                                                    }`}
                                                >
                                                    <div className="font-semibold">
                                                        {result.ok ? 'OK' : 'Failed'} · {result.name}
                                                    </div>
                                                    {!result.ok && result.message && (
                                                        <div className="text-[11px] text-rose-200/80 mt-1 break-words">
                                                            {result.message}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {enabledEngines.length < 2 && (
                                        <div className="text-xs text-amber-300 bg-amber-900/20 border border-amber-700/60 rounded p-2">
                                            Add another engine in the <span className="font-semibold">Engines</span> tab to start a match.
                                        </div>
                                    )}
                                </section>

                                <section className="bg-gray-900/40 p-4 rounded border border-gray-700 space-y-2">
                                    <h4 className="font-bold text-lg text-red-300">Troubleshooting</h4>
                                    <ul className="text-xs text-gray-400 list-disc list-inside space-y-1">
                                        <li>Verify the engine executable path and protocol (UCI/XBoard).</li>
                                        <li>Use "Detect Options" to confirm the engine responds.</li>
                                        <li>Make sure the engine runs from a terminal outside the GUI.</li>
                                        <li>Check for blocked permissions or antivirus prompts.</li>
                                    </ul>
                                </section>
                            </aside>
                        </div>

                        <details className="bg-gray-900/40 p-4 rounded border border-gray-700">
                            <summary className="cursor-pointer font-bold text-lg text-gray-200">Advanced: SPRT</summary>
                            <p className="text-xs text-gray-400 mt-2">
                                Stop early when the SPRT decision reaches Accept/Reject.
                            </p>
                            <div className="flex items-center justify-between mt-3">
                                <label className="flex items-center gap-2 text-sm text-gray-300">
                                    <input
                                        type="checkbox"
                                        checked={tournamentSettings.sprt.enabled}
                                        onChange={e => updateTournament({
                                            sprt: { ...tournamentSettings.sprt, enabled: e.target.checked },
                                        })}
                                    />
                                    Enable SPRT
                                </label>
                            </div>

                            {tournamentSettings.sprt.enabled && (
                                <div className="grid grid-cols-2 gap-4 text-sm mt-4">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">H0 Elo</label>
                                        <input
                                            type="number"
                                            className="bg-gray-700 border border-gray-600 rounded p-2 w-full"
                                            value={tournamentSettings.sprt.h0Elo}
                                            onChange={e => updateTournament({
                                                sprt: { ...tournamentSettings.sprt, h0Elo: parseFloat(e.target.value) || 0 },
                                            })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">H1 Elo</label>
                                        <input
                                            type="number"
                                            className="bg-gray-700 border border-gray-600 rounded p-2 w-full"
                                            value={tournamentSettings.sprt.h1Elo}
                                            onChange={e => updateTournament({
                                                sprt: { ...tournamentSettings.sprt, h1Elo: parseFloat(e.target.value) || 0 },
                                            })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Draw Ratio</label>
                                        <input
                                            type="number"
                                            min={0}
                                            max={0.99}
                                            step={0.01}
                                            className="bg-gray-700 border border-gray-600 rounded p-2 w-full"
                                            value={tournamentSettings.sprt.drawRatio}
                                            onChange={e => updateTournament({
                                                sprt: { ...tournamentSettings.sprt, drawRatio: parseFloat(e.target.value) || 0 },
                                            })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Alpha</label>
                                        <input
                                            type="number"
                                            min={0.001}
                                            max={0.5}
                                            step={0.001}
                                            className="bg-gray-700 border border-gray-600 rounded p-2 w-full"
                                            value={tournamentSettings.sprt.alpha}
                                            onChange={e => updateTournament({
                                                sprt: { ...tournamentSettings.sprt, alpha: parseFloat(e.target.value) || 0.05 },
                                            })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Beta</label>
                                        <input
                                            type="number"
                                            min={0.001}
                                            max={0.5}
                                            step={0.001}
                                            className="bg-gray-700 border border-gray-600 rounded p-2 w-full"
                                            value={tournamentSettings.sprt.beta}
                                            onChange={e => updateTournament({
                                                sprt: { ...tournamentSettings.sprt, beta: parseFloat(e.target.value) || 0.05 },
                                            })}
                                        />
                                    </div>
                                </div>
                            )}
                        </details>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="bg-gray-900 p-4 border-t border-gray-700 flex justify-end gap-3">
                {activeTab === 'tournaments' && onStartMatch && (
                    <button
                        onClick={() => {
                            onStartMatch();
                            onClose();
                        }}
                        className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded"
                    >
                        Start Match
                    </button>
                )}
                <button onClick={onClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded">
                    Done
                </button>
            </div>
        </div>
    </div>
  );
};

export default SettingsModal;
