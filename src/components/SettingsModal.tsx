import React, { useState, useEffect } from 'react';
import { Plus, Trash2, FolderOpen, Save, Upload, Copy, Settings, RefreshCw, X, Check } from 'lucide-react';
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
  mode: 'Match' | 'RoundRobin' | 'Gauntlet';
  gamesCount: number;
  swapSides: boolean;
  concurrency: number;
  timeControl: { baseMs: number; incMs: number };
  eventName: string;
  pgnPath: string;
  sprt: SprtSettings;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
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
    isOpen, onClose,
    engines, onUpdateEngines,
    adjudication, onUpdateAdjudication,
    opening, onUpdateOpening,
    tournamentSettings, onUpdateTournamentSettings
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'engines' | 'games' | 'tournaments'>('engines');
  const [editingEngineIdx, setEditingEngineIdx] = useState<number | null>(null);

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
                    {['general', 'engines', 'games', 'tournaments'].map(tab => (
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

                {activeTab === 'games' && (
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h4 className="font-bold text-lg text-blue-400 border-b border-gray-700 pb-2">Opening Suite</h4>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">FEN String</label>
                                <input className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                                       placeholder="Paste FEN..."
                                       value={opening.fen || ""}
                                       onChange={e => onUpdateOpening({...opening, fen: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">PGN / EPD File</label>
                                <div className="flex gap-2">
                                    <input className="flex-1 bg-gray-700 border border-gray-600 rounded p-2 text-xs"
                                           value={opening.file || ""} readOnly placeholder="No file selected" />
                                    <button onClick={async () => {
                                        const selected = await open({ filters: [{ name: 'Openings', extensions: ['pgn', 'epd'] }] });
                                        if (selected && typeof selected === 'string') onUpdateOpening({...opening, file: selected});
                                    }} className="bg-gray-600 px-3 rounded hover:bg-gray-500">Browse...</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Book Depth (Plies)</label>
                                    <input type="number" className="bg-gray-700 border border-gray-600 rounded p-2 w-full"
                                           value={opening.depth || 0} onChange={e => onUpdateOpening({...opening, depth: parseInt(e.target.value) || 0})} />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Order</label>
                                    <select className="bg-gray-700 border border-gray-600 rounded p-2 w-full"
                                            value={opening.order || "sequential"} onChange={e => onUpdateOpening({...opening, order: e.target.value})}>
                                        <option value="sequential">Sequential</option>
                                        <option value="random">Random</option>
                                    </select>
                                </div>
                            </div>
                            <div className="pt-4">
                                <h5 className="font-bold text-sm text-gray-300 mb-2">Opening Book (Polyglot)</h5>
                                <div className="flex gap-2">
                                    <input className="flex-1 bg-gray-700 border border-gray-600 rounded p-2 text-xs"
                                           value={opening.book_path || ""} readOnly placeholder="No .bin book selected" />
                                    <button onClick={async () => {
                                        const selected = await open({ filters: [{ name: 'Polyglot Book', extensions: ['bin'] }] });
                                        if (selected && typeof selected === 'string') onUpdateOpening({...opening, book_path: selected});
                                    }} className="bg-gray-600 px-3 rounded hover:bg-gray-500">Browse...</button>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="font-bold text-lg text-green-400 border-b border-gray-700 pb-2">Adjudication</h4>

                            <div className="bg-gray-900/40 p-3 rounded border border-gray-700">
                                <h5 className="font-bold text-sm text-gray-300 mb-2">Draw Adjudication</h5>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <label>Move Number:</label>
                                    <input type="number" className="bg-gray-700 rounded p-1 w-full"
                                           value={adjudication.draw_move_number || 40}
                                           onChange={e => onUpdateAdjudication({...adjudication, draw_move_number: parseInt(e.target.value)})} />

                                    <label>Move Count:</label>
                                    <input type="number" className="bg-gray-700 rounded p-1 w-full"
                                           value={adjudication.draw_move_count || 20}
                                           onChange={e => onUpdateAdjudication({...adjudication, draw_move_count: parseInt(e.target.value)})} />

                                    <label>Score (cp):</label>
                                    <input type="number" className="bg-gray-700 rounded p-1 w-full"
                                           value={adjudication.draw_score || 5}
                                           onChange={e => onUpdateAdjudication({...adjudication, draw_score: parseInt(e.target.value)})} />
                                </div>
                            </div>

                            <div className="bg-gray-900/40 p-3 rounded border border-gray-700">
                                <h5 className="font-bold text-sm text-gray-300 mb-2">Resign Adjudication</h5>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <label>Move Count:</label>
                                    <input type="number" className="bg-gray-700 rounded p-1 w-full"
                                           value={adjudication.resign_move_count || 5}
                                           onChange={e => onUpdateAdjudication({...adjudication, resign_move_count: parseInt(e.target.value)})} />

                                    <label>Score (cp):</label>
                                    <input type="number" className="bg-gray-700 rounded p-1 w-full"
                                           value={adjudication.resign_score || 600}
                                           onChange={e => onUpdateAdjudication({...adjudication, resign_score: parseInt(e.target.value)})} />
                                </div>
                            </div>

                             <label className="flex items-center gap-2 text-sm text-gray-300 mt-2">
                                <input type="checkbox" checked={adjudication.result_adjudication}
                                       onChange={e => onUpdateAdjudication({...adjudication, result_adjudication: e.target.checked})} />
                                TB / Syzygy Adjudication
                             </label>
                        </div>
                    </div>
                )}

                {activeTab === 'tournaments' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <h4 className="font-bold text-lg text-blue-400 border-b border-gray-700 pb-2">Tournament Format</h4>
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
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Games Count</label>
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
                                    </div>
                                </div>
                                <label className="flex items-center gap-2 text-sm text-gray-300">
                                    <input
                                        type="checkbox"
                                        checked={tournamentSettings.swapSides}
                                        onChange={e => updateTournament({ swapSides: e.target.checked })}
                                    />
                                    Swap sides each game
                                </label>
                            </div>

                            <div className="space-y-4">
                                <h4 className="font-bold text-lg text-green-400 border-b border-gray-700 pb-2">Time Control</h4>
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
                                    <label className="block text-xs text-gray-400 mb-1">Event Name</label>
                                    <input
                                        className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                                        value={tournamentSettings.eventName}
                                        onChange={e => updateTournament({ eventName: e.target.value })}
                                        placeholder="CCRL GUI Tournament"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">PGN Output Path</label>
                                    <input
                                        className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                                        value={tournamentSettings.pgnPath}
                                        onChange={e => updateTournament({ pgnPath: e.target.value })}
                                        placeholder="tournament.pgn"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-900/40 p-4 rounded border border-gray-700 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="font-bold text-lg text-purple-300">SPRT</h4>
                                    <p className="text-xs text-gray-400">Stop early when the SPRT decision reaches Accept/Reject.</p>
                                </div>
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
                                <div className="grid grid-cols-2 gap-4 text-sm">
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
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="bg-gray-900 p-4 border-t border-gray-700 flex justify-end">
                <button onClick={onClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded">
                    Done
                </button>
            </div>
        </div>
    </div>
  );
};

export default SettingsModal;
