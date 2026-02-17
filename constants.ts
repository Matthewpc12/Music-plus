
import { Track } from './types';

// API Configuration - Updated to new server
export const API_BASE_URL = "https://compared-achievements-plans-subaru.trycloudflare.com";

export const CACHE_KEY_METADATA = "apple_clone_metadata_v1";
export const CACHE_KEY_PLAYLISTS = "apple_clone_playlists_v1";
export const CACHE_KEY_COVERS = "apple_clone_covers_v1";
export const CACHE_KEY_LYRICS = "apple_clone_lyrics_v1";
export const CACHE_KEY_ANIMATED_COVERS = "apple_clone_animated_covers_v1";

export const DEFAULT_COVER = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=1000&auto=format&fit=crop";

export const SAMPLE_TRACKS: Track[] = [
  {
    id: "sample-1",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    filename: "SoundHelix-Song-1.mp3",
    title: "Celestial Echoes",
    artist: "SoundHelix",
    album: "Digital Dreams",
    coverUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=1000&auto=format&fit=crop",
    source: "local"
  },
  {
    id: "sample-2",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    filename: "SoundHelix-Song-2.mp3",
    title: "Neon Horizon",
    artist: "SoundHelix",
    album: "Synthwave Nights",
    coverUrl: "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=1000&auto=format&fit=crop",
    source: "local"
  },
  {
    id: "sample-3",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    filename: "SoundHelix-Song-3.mp3",
    title: "Midnight Drive",
    artist: "SoundHelix",
    album: "Retro Future",
    coverUrl: "https://images.unsplash.com/photo-1459749411177-042180ce673c?q=80&w=1000&auto=format&fit=crop",
    source: "local"
  }
];
