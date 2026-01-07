import React, { useState, useEffect } from 'react';
import { Plus, Trash2, FolderOpen, Save, Upload, Copy } from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';

interface EngineConfig {
  id?: string;
  name: string;
  path: string;
  options: [string, string][];
  country_code?: string;
  args?: string[];
  working_directory?: string;
  protocol?: string; // for cutechess compat
}

interface EngineManagerProps {
  engines: EngineConfig[];
  onUpdate: (engines: EngineConfig[]) => void;
  onClose: () => void;
}

const EngineManager: React.FC<EngineManagerProps> = ({ engines, onUpdate, onClose }) => {
  const [localEngines, setLocalEngines] = useState<EngineConfig[]>([]);

  useEffect(() => {
    // Deep copy to avoid mutating props directly
    setLocalEngines(JSON.parse(JSON.stringify(engines)));
  }, [engines]);

  const saveChanges = () => {
    onUpdate(localEngines);
    onClose();
  };

  const addEngine = () => {
    setLocalEngines([...localEngines, {
      id: crypto.randomUUID(),
      name: "New Engine",
      path: "",
      options: [],
      protocol: "uci"
    }]);
  };

  const removeEngine = (index: number) => {
    const newEngines = [...localEngines];
    newEngines.splice(index, 1);
    setLocalEngines(newEngines);
  };

  const duplicateEngine = (index: number) => {
      const eng = JSON.parse(JSON.stringify(localEngines[index]));
      eng.id = crypto.randomUUID();
      eng.name = eng.name + " (Copy)";
      setLocalEngines([...localEngines, eng]);
  };

  const updateEngineField = (index: number, field: keyof EngineConfig, value: any) => {
    const newEngines = [...localEngines];
    // @ts-ignore
    newEngines[index][field] = value;
    setLocalEngines(newEngines);
  };

  const browsePath = async (index: number) => {
    const selected = await open({ multiple: false, filters: [{ name: 'Executables', extensions: ['exe', ''] }] });
    if (selected && typeof selected === 'string') {
      updateEngineField(index, 'path', selected);
    }
  };

  // const importCutechess = async () => { ... } // Removed unused async import logic in favor of <input type="file">

  // Helper for actual import if we had the content
  const parseCutechess = (json: string) => {
      try {
          const parsed = JSON.parse(json);
          // Cutechess is an array of objects
          if (Array.isArray(parsed)) {
              const mapped: EngineConfig[] = parsed.map((e: any) => ({
                  id: crypto.randomUUID(),
                  name: e.name || "Unknown",
                  path: e.command || "",
                  args: e.args ? (Array.isArray(e.args) ? e.args : e.args.split(" ")) : [],
                  working_directory: e.workingDirectory,
                  protocol: e.protocol || "uci",
                  country_code: "",
                  options: [] // Cutechess options parsing is complex, skipping for now
              }));
              setLocalEngines(prev => [...prev, ...mapped]);
          }
      } catch (e) {
          alert("Failed to parse JSON");
      }
  };

  const exportCutechess = async () => {
      const exportData = localEngines.map(e => ({
          command: e.path,
          name: e.name,
          protocol: e.protocol || "uci",
          workingDirectory: e.working_directory || "",
          args: e.args || []
      }));
      const json = JSON.stringify(exportData, null, 2);
      const path = await save({ filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (path) {
          // await writeTextFile(path, json);
          console.log("Saving to", path, json);
          alert("Check console for JSON content (FS write pending)");
      }
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-4xl h-[90vh] flex flex-col border border-gray-600 shadow-2xl">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">Engine Database</h2>
          <div className="flex gap-2">
             <button onClick={() => document.getElementById('importFile')?.click()} className="flex items-center gap-1 bg-gray-700 px-3 py-1 rounded hover:bg-gray-600 text-xs"><Upload size={14}/> Import</button>
             <input type="file" id="importFile" className="hidden" accept=".json" onChange={(e) => {
                 if (e.target.files?.[0]) {
                     const reader = new FileReader();
                     reader.onload = (ev) => parseCutechess(ev.target?.result as string);
                     reader.readAsText(e.target.files[0]);
                 }
             }}/>
             <button onClick={exportCutechess} className="flex items-center gap-1 bg-gray-700 px-3 py-1 rounded hover:bg-gray-600 text-xs"><Save size={14}/> Export</button>
             <button onClick={onClose} className="text-gray-400 hover:text-white ml-4">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 grid gap-2">
            {localEngines.length === 0 && <div className="text-gray-500 text-center mt-10">No engines in library. Add one to get started.</div>}
            {localEngines.map((eng, idx) => (
                <div key={eng.id || idx} className="bg-gray-700 p-3 rounded flex flex-col gap-2 border border-gray-600">
                    <div className="flex gap-2">
                        <input className="bg-gray-900 p-2 rounded text-sm font-bold flex-1 border border-gray-700 focus:border-blue-500 outline-none"
                               value={eng.name}
                               onChange={e => updateEngineField(idx, 'name', e.target.value)}
                               placeholder="Engine Name" />
                        <button onClick={() => duplicateEngine(idx)} className="p-2 bg-gray-600 rounded hover:bg-gray-500" title="Duplicate"><Copy size={16}/></button>
                        <button onClick={() => removeEngine(idx)} className="p-2 bg-red-900/50 rounded hover:bg-red-900 text-red-200" title="Delete"><Trash2 size={16}/></button>
                    </div>
                    <div className="flex gap-2 items-center">
                        <input className="bg-gray-900 p-2 rounded text-xs font-mono flex-1 border border-gray-700"
                               value={eng.path}
                               onChange={e => updateEngineField(idx, 'path', e.target.value)}
                               placeholder="Executable Path..." />
                        <button onClick={() => browsePath(idx)} className="bg-blue-600 px-3 py-2 rounded hover:bg-blue-500"><FolderOpen size={16}/></button>
                    </div>
                    {/* Minimal advanced fields */}
                    <div className="grid grid-cols-2 gap-2">
                         <input className="bg-gray-900 p-1 rounded text-xs" placeholder="Args (e.g. --bench)" value={eng.args ? eng.args.join(" ") : ""} onChange={e => updateEngineField(idx, 'args', e.target.value.split(" "))}/>
                         <input className="bg-gray-900 p-1 rounded text-xs" placeholder="Working Directory" value={eng.working_directory || ""} onChange={e => updateEngineField(idx, 'working_directory', e.target.value)}/>
                    </div>
                </div>
            ))}
        </div>

        <div className="p-4 border-t border-gray-700 flex justify-between bg-gray-900">
            <button onClick={addEngine} className="bg-green-600 px-4 py-2 rounded font-bold hover:bg-green-500 flex items-center gap-2"><Plus size={18}/> Add Engine</button>
            <button onClick={saveChanges} className="bg-blue-600 px-6 py-2 rounded font-bold hover:bg-blue-500">Save Changes</button>
        </div>
      </div>
    </div>
  );
};

export default EngineManager;
