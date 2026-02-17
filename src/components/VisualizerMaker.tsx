
import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Lock, Unlock, Save, Download, Move, Palette, Zap, Layers, ChevronRight, Square, Circle as CircleIcon, Star as StarIcon, Minus } from 'lucide-react';
import { VisualizerElement, CustomVisualizerConfig } from '../types';
import { Visualizer } from './Visualizer';

interface VisualizerMakerProps {
  analyser: AnalyserNode | null;
  onClose: () => void;
  onSave: (config: CustomVisualizerConfig) => void;
  initialConfig?: CustomVisualizerConfig;
}

const STORAGE_KEY = "apple_music_custom_viz";

export const VisualizerMaker: React.FC<VisualizerMakerProps> = ({ analyser, onClose, onSave, initialConfig }) => {
  const [config, setConfig] = useState<CustomVisualizerConfig>(initialConfig || {
    id: 'custom-' + Date.now(),
    name: 'New Visualizer',
    elements: [],
    background: '#000000'
  });
  
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const selectedElement = config.elements.find(e => e.id === selectedId);

  useEffect(() => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && !initialConfig) {
          try { setConfig(JSON.parse(saved)); } catch (e) {}
      }
  }, [initialConfig]);

  useEffect(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  const addElement = (type: VisualizerElement['type']) => {
    const newElement: VisualizerElement = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      x: 50, y: 50,
      size: 50, width: 100, height: 100,
      color: '#fa2d48',
      glow: 20,
      opacity: 0.8,
      reactivity: 'bass',
      reactiveProperty: 'scale',
      rotation: 0,
      isLocked: false
    };
    setConfig(prev => ({ ...prev, elements: [...prev.elements, newElement] }));
    setSelectedId(newElement.id);
  };

  const updateElement = (id: string, updates: Partial<VisualizerElement>) => {
    setConfig(prev => ({
      ...prev,
      elements: prev.elements.map(e => e.id === id ? { ...e, ...updates } : e)
    }));
  };

  const removeElement = (id: string) => {
    setConfig(prev => ({ ...prev, elements: prev.elements.filter(e => e.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  };

  const handleCanvasTouch = (e: React.TouchEvent | React.MouseEvent) => {
    if (!canvasContainerRef.current) return;
    const rect = canvasContainerRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const xPercent = ((clientX - rect.left) / rect.width) * 100;
    const yPercent = ((clientY - rect.top) / rect.height) * 100;

    if (selectedId && !selectedElement?.isLocked) {
        updateElement(selectedId, { x: xPercent, y: yPercent });
    }
  };

  const handleDownload = () => {
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${config.name.replace(/\s+/g, '_')}.json`;
      a.click();
      URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black text-white flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-6 border-b border-white/10 backdrop-blur-xl bg-black/50">
        <div className="flex items-center gap-4">
            <button onClick={onClose} className="p-2 -ml-2 text-zinc-500 hover:text-white"><X className="w-6 h-6" /></button>
            <input 
                type="text" value={config.name} 
                onChange={e => setConfig({...config, name: e.target.value})}
                className="bg-transparent border-none text-xl font-bold focus:ring-0 w-48" 
            />
        </div>
        <div className="flex items-center gap-2">
            <button onClick={handleDownload} className="p-2 bg-white/5 rounded-full hover:bg-white/10" title="Download JSON"><Download className="w-5 h-5" /></button>
            <button onClick={() => onSave(config)} className="px-6 py-2 bg-[#fa2d48] rounded-full font-bold shadow-lg shadow-red-600/20 active-scale">Save Studio</button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Toolbox / Layer Manager */}
        <aside className="w-full lg:w-72 border-r border-white/10 bg-zinc-900/50 flex flex-col overflow-hidden">
            <div className="p-4 flex flex-col gap-4">
                <h3 className="text-[11px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Layers className="w-3 h-3" /> Toolbox</h3>
                <div className="grid grid-cols-4 gap-2">
                    <ToolBtn icon={CircleIcon} label="Circle" onClick={() => addElement('circle')} />
                    <ToolBtn icon={Square} label="Rect" onClick={() => addElement('rect')} />
                    <ToolBtn icon={Minus} label="Line" onClick={() => addElement('line')} />
                    <ToolBtn icon={StarIcon} label="Star" onClick={() => addElement('star')} />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto border-t border-white/5 no-scrollbar">
                <div className="p-4 space-y-2">
                    <h3 className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-4">Elements</h3>
                    {config.elements.length === 0 && <p className="text-zinc-600 text-xs text-center py-8 italic">No elements yet. Add one from above.</p>}
                    {config.elements.map((el, idx) => (
                        <div 
                            key={el.id} 
                            onClick={() => setSelectedId(el.id)}
                            className={`group flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer ${selectedId === el.id ? 'bg-[#fa2d48]/10 ring-1 ring-[#fa2d48]/30' : 'hover:bg-white/5'}`}
                        >
                            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-zinc-400">
                                {el.type === 'circle' ? <CircleIcon className="w-4 h-4" /> : el.type === 'rect' ? <Square className="w-4 h-4" /> : <StarIcon className="w-4 h-4" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold truncate capitalize">{el.type} {idx + 1}</p>
                                <p className="text-[10px] text-zinc-500 uppercase tracking-tighter">{el.reactivity} • {el.reactiveProperty}</p>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); updateElement(el.id, { isLocked: !el.isLocked }); }} className="p-1 opacity-40 hover:opacity-100">
                                {el.isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); removeElement(el.id); }} className="p-1 text-red-500 opacity-0 group-hover:opacity-100 hover:scale-110 transition-all"><Trash2 className="w-3 h-3" /></button>
                        </div>
                    ))}
                </div>
            </div>
        </aside>

        {/* Canvas / Preview */}
        <main className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
            <div 
                ref={canvasContainerRef}
                className="relative w-full h-full cursor-crosshair active:cursor-grabbing overflow-hidden"
                onMouseDown={() => setIsDragging(true)}
                onMouseUp={() => setIsDragging(false)}
                onMouseMove={isDragging ? handleCanvasTouch : undefined}
                onTouchMove={handleCanvasTouch}
            >
                <Visualizer analyser={analyser} style="custom" customConfig={config} className="w-full h-full pointer-events-none" />
                
                {/* Selection Overlay */}
                {selectedElement && (
                    <div 
                        className="absolute pointer-events-none border-2 border-[#fa2d48] rounded-sm transition-all duration-75"
                        style={{ 
                            left: `${selectedElement.x}%`, 
                            top: `${selectedElement.y}%`, 
                            width: selectedElement.type === 'circle' || selectedElement.type === 'star' ? `${selectedElement.size}px` : `${selectedElement.width}px`,
                            height: selectedElement.type === 'circle' || selectedElement.type === 'star' ? `${selectedElement.size}px` : `${selectedElement.height}px`,
                            transform: `translate(-50%, -50%) rotate(${selectedElement.rotation}deg)`,
                            boxShadow: `0 0 20px ${selectedElement.color}44`
                        }}
                    >
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-[#fa2d48] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest whitespace-nowrap">Editing</div>
                    </div>
                )}
            </div>
            
            {/* Visualizer Helper UI */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-2xl px-6 py-3 rounded-full border border-white/10 text-xs font-medium text-zinc-400 flex items-center gap-4 animate-in slide-in-from-bottom-4">
                <span className="flex items-center gap-2"><Move className="w-3 h-3" /> Drag to position</span>
                <span className="w-px h-3 bg-white/10" />
                <span className="flex items-center gap-2"><Plus className="w-3 h-3" /> Select element to edit</span>
            </div>
        </main>

        {/* Inspector Panel */}
        {selectedId && selectedElement ? (
            <aside className="w-full lg:w-80 border-l border-white/10 bg-zinc-900/50 flex flex-col overflow-y-auto no-scrollbar">
                <div className="p-6 space-y-8">
                    <header className="flex items-center justify-between">
                        <h3 className="text-[11px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Palette className="w-3 h-3" /> Inspector</h3>
                        <button onClick={() => setSelectedId(null)} className="p-1 hover:bg-white/5 rounded"><X className="w-4 h-4" /></button>
                    </header>

                    {/* Basic Visuals */}
                    <div className="space-y-6">
                        <label className="block text-xs font-black text-zinc-400 uppercase">Appearance</label>
                        
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-sm font-medium">Color</span>
                            <div className="flex items-center gap-2">
                                <input type="color" value={selectedElement.color} onChange={e => updateElement(selectedElement.id, { color: e.target.value })} className="w-10 h-10 bg-transparent border-none" />
                                <span className="text-xs font-mono opacity-50 uppercase">{selectedElement.color}</span>
                            </div>
                        </div>

                        <Slider label="Opacity" value={selectedElement.opacity} min={0} max={1} step={0.01} onChange={v => updateElement(selectedElement.id, { opacity: v })} />
                        <Slider label="Glow (Shadow)" value={selectedElement.glow} min={0} max={200} step={1} onChange={v => updateElement(selectedElement.id, { glow: v })} />
                        
                        {['circle', 'star'].includes(selectedElement.type) ? (
                            <Slider label="Size" value={selectedElement.size} min={5} max={500} step={1} onChange={v => updateElement(selectedElement.id, { size: v })} />
                        ) : (
                            <>
                                <Slider label="Width" value={selectedElement.width} min={5} max={1000} step={1} onChange={v => updateElement(selectedElement.id, { width: v })} />
                                {selectedElement.type === 'rect' && <Slider label="Height" value={selectedElement.height} min={5} max={1000} step={1} onChange={v => updateElement(selectedElement.id, { height: v })} />}
                            </>
                        )}
                        
                        <Slider label="Rotation (deg)" value={selectedElement.rotation} min={0} max={360} step={1} onChange={v => updateElement(selectedElement.id, { rotation: v })} />
                    </div>

                    {/* Reactivity */}
                    <div className="space-y-6 pt-6 border-t border-white/5">
                        <label className="block text-xs font-black text-[#fa2d48] uppercase flex items-center gap-2"><Zap className="w-3 h-3" /> Reactivity</label>
                        
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-zinc-500">React To Frequency</label>
                            <div className="grid grid-cols-2 gap-2">
                                {['bass', 'mids', 'treble', 'none'].map(r => (
                                    <button 
                                        key={r} onClick={() => updateElement(selectedElement.id, { reactivity: r as any })}
                                        className={`py-2 rounded-lg text-xs font-bold capitalize transition-all ${selectedElement.reactivity === r ? 'bg-[#fa2d48] text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10'}`}
                                    >
                                        {r}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-xs font-bold text-zinc-500">Transform Behavior</label>
                            <div className="grid grid-cols-2 gap-2">
                                {['scale', 'opacity', 'rotation', 'none'].map(p => (
                                    <button 
                                        key={p} onClick={() => updateElement(selectedElement.id, { reactiveProperty: p as any })}
                                        className={`py-2 rounded-lg text-xs font-bold capitalize transition-all ${selectedElement.reactiveProperty === p ? 'bg-white text-black' : 'bg-white/5 text-zinc-400 hover:bg-white/10'}`}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </aside>
        ) : (
            <aside className="w-full lg:w-80 border-l border-white/10 bg-zinc-900/50 flex flex-col items-center justify-center p-8 text-center text-zinc-500 gap-4">
                 <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center"><Palette className="w-8 h-8 opacity-20" /></div>
                 <div>
                    <h3 className="font-bold text-white text-sm">Studio Idle</h3>
                    <p className="text-xs">Add elements or select an existing one from the layers list to start tweaking.</p>
                 </div>
            </aside>
        )}
      </div>
    </div>
  );
};

function ToolBtn({ icon: Icon, label, onClick }: any) {
    return (
        <button onClick={onClick} className="flex flex-col items-center justify-center gap-2 p-3 bg-white/5 rounded-2xl hover:bg-white/10 active:scale-95 transition-all">
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-bold text-zinc-500 uppercase">{label}</span>
        </button>
    );
}

function Slider({ label, value, min, max, step, onChange }: { label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void }) {
    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-medium">
                <span className="text-zinc-500">{label}</span>
                <span className="text-zinc-300 font-mono">{Number(value).toFixed(step < 1 ? 2 : 0)}</span>
            </div>
            <input 
                type="range" min={min} max={max} step={step} value={value} 
                onChange={e => onChange(parseFloat(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-full accent-[#fa2d48]" 
            />
        </div>
    );
}
