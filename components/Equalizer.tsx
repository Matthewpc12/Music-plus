import React from 'react';
import { EqualizerSettings } from '../types';

interface EqualizerProps {
  settings: EqualizerSettings;
  onChange: (s: EqualizerSettings) => void;
  onClose: () => void;
}

export const Equalizer: React.FC<EqualizerProps> = ({ settings, onChange, onClose }) => {
  const handleChange = (key: keyof EqualizerSettings, value: number) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl p-6 rounded-2xl w-80 shadow-2xl border border-white/20"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Equalizer</h3>
          <button onClick={onClose} className="text-sm text-red-500 font-medium hover:text-red-600">Done</button>
        </div>

        <div className="space-y-6">
          {(['bass', 'mids', 'treble'] as const).map((band) => (
            <div key={band} className="space-y-2">
              <div className="flex justify-between text-xs font-medium text-gray-500 uppercase tracking-wider">
                <span>{band}</span>
                <span>{settings[band]} dB</span>
              </div>
              <input
                type="range"
                min="-12"
                max="12"
                step="1"
                value={settings[band]}
                onChange={(e) => handleChange(band, parseFloat(e.target.value))}
                className="w-full h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-red-500"
              />
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>-12dB</span>
                <span>0dB</span>
                <span>+12dB</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};