
export interface Track {
  id: string;
  url: string;
  filename: string;
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  animatedCoverUrl?: string;
  duration?: number;
  source: 'remote' | 'local';
  videoUrl?: string;
  lyrics?: string;
}

export interface VisualizerElement {
  id: string;
  type: 'circle' | 'rect' | 'line' | 'star';
  x: number; // 0-100 percentage
  y: number; // 0-100 percentage
  size: number;
  width: number;
  height: number;
  color: string;
  glow: number;
  opacity: number;
  reactivity: 'bass' | 'mids' | 'treble' | 'none';
  reactiveProperty: 'scale' | 'opacity' | 'rotation' | 'none';
  rotation: number;
  isLocked: boolean;
}

export interface CustomVisualizerConfig {
  id: string;
  name: string;
  elements: VisualizerElement[];
  background: string;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
}

export interface EqualizerSettings {
  bass: number;
  mids: number;
  treble: number;
}

export interface RadioStation {
  id: string;
  name: string;
  description: string;
  topic: string;
  voiceName: string;
  coverGradient: string;
}

declare global {
  interface Window {
    jsmediatags: any;
  }
}
