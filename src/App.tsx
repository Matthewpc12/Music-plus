import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  fetchAllTracks, 
  extractMetadataFromTrack, 
  apiFetch, 
  saveTrackVideoUrl, 
  uploadTrackWithProgress, 
  getAlbumOrders, 
  saveAlbumOrder, 
  saveTrackLyrics,
  resolveYoutubeProxy,
  saveImportedTrack,
  saveAnimatedCoverMapping,
  getAnimatedCoversRegistry,
  saveTrackMetadata,
  saveBatchTrackMetadata,
  saveCustomCoverMapping,
  deleteTracks
} from '../services/apiService';
import { useAudio } from '../hooks/useAudio';
import { Track, Playlist, CustomVisualizerConfig } from '../types';
import { Visualizer, VisualizerStyle } from './components/Visualizer';
import { VisualizerMaker } from './components/VisualizerMaker';
import { ImmersiveVideoPlayer } from '../components/ImmersiveVideoPlayer';
import { Equalizer } from '../components/Equalizer';
import { FlappySongGame } from '../components/FlappySongGame';
import { RhythmGame } from '../components/RhythmGame';
import { get, set } from 'idb-keyval';
import { CACHE_KEY_PLAYLISTS, DEFAULT_COVER } from '../constants';
import { 
  Play, Pause, SkipForward, SkipBack, Search, Disc,
  Maximize2, Sliders, Tv, Clock, Mic, SquareStack, FileMusic,
  Zap, Loader2, RefreshCw, ChevronDown, MoreHorizontal,
  Shuffle, Repeat, Music, Layers, Volume2, VolumeX, List, AlertCircle, Link2,
  Settings, CheckCircle2, Database, HardDrive, Info, Upload, ChevronLeft, Plus, X, Home, Trash2, User, Library, Download, FileJson,
  LayoutGrid, Compass, Headphones, Star, Globe, History, Heart, Shield, Bell, ChevronRight, Monitor, Dices, ArrowUp, ArrowDown, Lock, Unlock, Save, Gamepad2, Sparkles, Mic2, Signal, Music2, MessageSquareQuote, FileText, Youtube, Image as ImageIcon, Palette, Edit, Camera, ExternalLink
} from 'lucide-react';

type ViewState = 'library' | 'search' | 'playlists' | 'artists' | 'albums' | 'playlist-detail' | 'artist-detail' | 'album-detail' | 'settings' | 'roulette' | 'games';

interface UploadStatus {
  id: string;
  filename: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error' | 'downloading';
  file?: File;
}

const getTrackNumber = (track: Track): number => {
  const match = track.filename.match(/(\d+)/);
  return match ? parseInt(match[1]) : 9999;
};

interface LyricLine {
    time: number;
    text: string;
}
const parseLyrics = (lrc: string): LyricLine[] => {
    if (!lrc) return [];
    const lines = lrc.split('\n');
    const result: LyricLine[] = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
    for (const line of lines) {
        const match = line.match(timeRegex);
        if (match) {
            const min = parseInt(match[1]);
            const sec = parseInt(match[2]);
            const msStr = match[3].padEnd(3, '0');
            const ms = parseInt(msStr);
            const time = min * 60 + sec + (ms / 1000);
            const text = line.replace(timeRegex, '').trim();
            if (text) result.push({ time, text });
        }
    }
    return result;
};

const setCookie = (name: string, value: string, days: number) => {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${date.toUTCString()};path=/`;
};

const getCookie = (name: string) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift();
    return undefined;
};

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [albumOrders, setAlbumOrders] = useState<Record<string, string[]>>({});
  const [isPlaylistsLoaded, setIsPlaylistsLoaded] = useState(false);
  const [view, setView] = useState<ViewState>('library');
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [fullScreenPlayer, setFullScreenPlayer] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEqOpen, setIsEqOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'none' | 'one' | 'all'>('none');
  const [uploadQueue, setUploadQueue] = useState<UploadStatus[]>([]);
  const [visualizerStyle, setVisualizerStyle] = useState<VisualizerStyle>('normal');
  const [customVizConfig, setCustomVizConfig] = useState<CustomVisualizerConfig | undefined>(undefined);
  const [showVizMaker, setShowVizMaker] = useState(false);
  const [videoAutoplay, setVideoAutoplay] = useState(true);
  const [isAnimatedCoversEnabled, setIsAnimatedCoversEnabled] = useState(true);
  const [lyricsOffset, setLyricsOffset] = useState(0.1); 
  
  const [isAppLocked, setIsAppLocked] = useState(true);

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [showBatchEditModal, setShowBatchEditModal] = useState(false);

  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState<{ type: 'upload' | 'reorder' | 'video' | 'dev_mode' | 'youtube' | 'edit_info' | 'batch_edit' | null }>({ type: null });
  const pendingTrackRef = useRef<Track | null>(null);
  
  const [playingGame, setPlayingGame] = useState<'flappy' | 'rhythm' | null>(null);
  const [gameTrack, setGameTrack] = useState<Track | null>(null);

  const [previewTrack, setPreviewTrack] = useState<Track | null>(null);

  const [isReordering, setIsReordering] = useState(false);
  const [reorderList, setReorderList] = useState<Track[]>([]);
  
  const [showBatchLyricsModal, setShowBatchLyricsModal] = useState(false);
  const [showYoutubeModal, setShowYoutubeModal] = useState(false);
  const [showAnimatedCoverModal, setShowAnimatedCoverModal] = useState(false);
  const [showUploadMetaModal, setShowUploadMetaModal] = useState<{ files: File[] } | null>(null);
  const [editTrackModal, setEditTrackModal] = useState<{ isOpen: boolean, track: Track | null }>({ isOpen: false, track: null });
  
  const [nowPlayingList, setNowPlayingList] = useState<Track[]>([]);
  const [isHudVisible, setIsHudVisible] = useState(true);
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [videoLinkModal, setVideoLinkModal] = useState<{ isOpen: boolean, track: Track | null }>({ isOpen: false, track: null });
  const [playlistModal, setPlaylistModal] = useState<{ isOpen: boolean, track: Track | null }>({ isOpen: false, track: null });
  const [createPlaylistModal, setCreatePlaylistModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const lyricsInputRef = useRef<HTMLInputElement>(null);
  const lyricsTrackRef = useRef<Track | null>(null);

  const {
    isPlaying,
    isBuffering,
    isEnded,
    currentTrack,
    currentTime,
    duration,
    volume,
    setVolume,
    isMuted,
    setIsMuted,
    seek,
    playTrack,
    prefetchTrack,
    togglePlayPause,
    analyserNode,
    equalizerSettings,
    setEqualizerSettings,
    registerVideo,
    unregisterVideo,
    mode,
    setMode,
    setMediaHandlers,
    setTrackMetadata,
    requestPiP,
    isPipActive
  } = useAudio();

  useEffect(() => {
    const unlocked = getCookie('app_unlocked');
    if (unlocked === 'true') {
        setIsAppLocked(false);
    }
  }, []);

  const handleAppUnlock = (password: string) => {
      if (password === "MusizFRL5643") {
          setIsAppLocked(false);
          setCookie('app_unlocked', 'true', 30);
      } else {
          alert("Invalid Access Code");
      }
  };

  const toggleTrackSelection = (id: string) => {
      setSelectedTrackIds(prev => prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]);
  };

  const startSelectionMode = () => {
      setIsSelectionMode(true);
      setSelectedTrackIds([]);
  };

  const cancelSelection = () => {
      setIsSelectionMode(false);
      setSelectedTrackIds([]);
  };

  const handleBatchEdit = () => {
      if (!isAuthorized) {
          setShowPasswordModal({ type: 'batch_edit' });
      } else {
          setShowBatchEditModal(true);
      }
  };

  const performBatchUpdate = async (metadata: { artist?: string, album?: string, title?: string }, coverFile?: File, coverType: 'static' | 'animated' = 'static') => {
      setShowBatchEditModal(false);
      setIsLoading(true);
      
      try {
          if (coverFile) {
              const success = await uploadTrackWithProgress(coverFile, () => {});
              if (success) {
                  for (const trackId of selectedTrackIds) {
                      const key = `track:${trackId}`;
                      if (coverType === 'animated') {
                          await saveAnimatedCoverMapping(key, coverFile.name);
                      } else {
                          await saveCustomCoverMapping(key, coverFile.name);
                      }
                  }
              }
          }
          
          const updated = await saveBatchTrackMetadata(selectedTrackIds, metadata);
          setTracks(updated.map(t => ({...t, artist: cleanArtist(t.artist)})));
          cancelSelection();
      } catch (e) {
          console.error("Batch update failed", e);
          alert("Error during batch update.");
      } finally {
          setIsLoading(false);
      }
  };

  const performBatchDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedTrackIds.length} tracks? This action cannot be undone.`)) return;
    
    setShowBatchEditModal(false);
    setIsLoading(true);
    
    try {
        const success = await deleteTracks(selectedTrackIds);
        if (success) {
            await loadData(false);
            cancelSelection();
        } else {
            alert("Failed to delete tracks from server. Cache cleared.");
            await loadData(false);
        }
    } catch (e) {
        alert("Deletion failed.");
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    const savedViz = localStorage.getItem('apple_clone_viz_style');
    if (savedViz) setVisualizerStyle(savedViz as VisualizerStyle);
    
    const savedCustomViz = localStorage.getItem('apple_music_custom_viz');
    if (savedCustomViz) {
        try { setCustomVizConfig(JSON.parse(savedCustomViz)); } catch (e) {}
    }

    const savedAuth = localStorage.getItem('apple_music_auth');
    if (savedAuth === 'true') setIsAuthorized(true);

    const savedVideoAutoplay = localStorage.getItem('apple_clone_video_autoplay');
    if (savedVideoAutoplay !== null) setVideoAutoplay(savedVideoAutoplay === 'true');

    const savedAnimatedCovers = localStorage.getItem('apple_clone_animated_covers_enabled');
    if (savedAnimatedCovers !== null) setIsAnimatedCoversEnabled(savedAnimatedCovers === 'true');

    const savedOffset = localStorage.getItem('apple_clone_lyrics_offset');
    if (savedOffset) setLyricsOffset(parseFloat(savedOffset));
  }, []);

  const changeVisualizerStyle = (s: VisualizerStyle) => {
    setVisualizerStyle(s);
    localStorage.setItem('apple_clone_viz_style', s);
  };

  const changeLyricsOffset = (val: number) => {
    setLyricsOffset(val);
    localStorage.setItem('apple_clone_lyrics_offset', String(val));
  };
  
  useEffect(() => {
      if (playingGame && isPlaying) {
          togglePlayPause();
      }
  }, [playingGame, isPlaying, togglePlayPause]);

  const isUploading = useMemo(() => uploadQueue.some(u => u.status === 'pending' || u.status === 'uploading' || u.status === 'downloading'), [uploadQueue]);

  const activePlaylist = useMemo(() => 
    playlists.find(p => p.id === activePlaylistId) || null
  , [playlists, activePlaylistId]);

  const cleanArtist = useCallback((artist: string) => {
    return artist ? artist.replace(/\//g, ', ') : "Unknown Artist";
  }, []);

  const cleanTitle = useCallback((title: string) => {
    return title ? title.trim() : "Unknown Title";
  }, []);

  const isTrackSingle = useCallback((album: string | undefined) => {
    if (!album) return true;
    const trimmed = album.trim();
    if (trimmed === "" || trimmed.includes("APIC(encoding=") || trimmed === "Unknown Album") return true;
    return false;
  }, []);

  const getTrackAlbum = useCallback((album: string | undefined) => {
    return isTrackSingle(album) ? "Singles" : (album || "Unknown Album");
  }, [isTrackSingle]);

  useEffect(() => {
    const loadPlaylists = async () => {
      const saved = await get(CACHE_KEY_PLAYLISTS);
      if (saved && Array.isArray(saved)) setPlaylists(saved);
      setIsPlaylistsLoaded(true);
    };
    loadPlaylists();
  }, []);

  useEffect(() => {
    if (isPlaylistsLoaded) {
      set(CACHE_KEY_PLAYLISTS, playlists);
    }
  }, [playlists, isPlaylistsLoaded]);

  const artistsList = useMemo(() => {
      const distinct = Array.from(new Set(tracks.map(t => cleanArtist(t.artist))));
      return distinct.sort();
  }, [tracks, cleanArtist]);
  
  const albumsList = useMemo(() => {
    const albumMap = new Map<string, { name: string, artist: string, cover: string, animatedCover?: string }>();
    tracks.forEach(t => {
      const albumName = getTrackAlbum(t.album);
      if (!albumMap.has(albumName)) {
        albumMap.set(albumName, { 
          name: albumName, 
          artist: albumName === "Singles" ? "Various Artists" : cleanArtist(t.artist), 
          cover: t.coverUrl || DEFAULT_COVER,
          animatedCover: t.animatedCoverUrl
        });
      }
    });
    return Array.from(albumMap.values()).sort((a, b) => {
        if (a.name === "Singles") return -1;
        return a.name.localeCompare(b.name);
    });
  }, [tracks, cleanArtist, getTrackAlbum]);

  const currentViewTracks = useMemo(() => {
    if (view === 'settings') return [];
    if (view === 'playlist-detail' && activePlaylist) return activePlaylist.tracks;
    
    let filtered = [...tracks];
    
    if (view === 'artist-detail' && activeItem) {
        filtered = tracks.filter(t => cleanArtist(t.artist) === activeItem);
        filtered.sort((a, b) => {
            if (a.album !== b.album) return a.album.localeCompare(b.album);
            return getTrackNumber(a) - getTrackNumber(b);
        });
        return filtered;
    } else if (view === 'album-detail' && activeItem) {
        filtered = tracks.filter(t => getTrackAlbum(t.album) === activeItem);
        const savedOrder = albumOrders[activeItem];
        if (savedOrder && savedOrder.length > 0) {
            const orderMap = new Map<string, number>(savedOrder.map((id, index) => [id, index]));
            filtered.sort((a, b) => {
                const idxA = orderMap.get(a.id) ?? 9999;
                const idxB = orderMap.get(b.id) ?? 9999;
                if (idxA !== idxB) return idxA - idxB;
                const numA = getTrackNumber(a);
                const numB = getTrackNumber(b);
                if (numA !== numB) return numA - numB;
                return a.filename.localeCompare(b.filename, undefined, { numeric: true });
            });
        } else {
             filtered.sort((a, b) => {
              const numA = getTrackNumber(a);
              const numB = getTrackNumber(b);
              if (numA !== numB) return numA - numB;
              return a.filename.localeCompare(b.filename, undefined, { numeric: true });
            });
        }
        return filtered;
    } else if (view === 'search') {
        const q = searchQuery.toLowerCase();
        if (!q) return [];
        filtered = tracks.filter(t => 
            t.title.toLowerCase().includes(q) || 
            cleanArtist(t.artist).toLowerCase().includes(q) ||
            (t.album && t.album.toLowerCase().includes(q))
        );
    }
    
    return filtered.reverse();
  }, [view, tracks, searchQuery, activePlaylist, activeItem, cleanArtist, getTrackAlbum, albumOrders]);

  const nextTrack = useMemo(() => {
    const list = nowPlayingList.length > 0 ? nowPlayingList : (currentViewTracks.length > 0 ? currentViewTracks : tracks);
    if (list.length === 0 || !currentTrack) return null;
    
    if (isShuffle) {
      const others = list.filter(t => t.id !== currentTrack.id);
      return others.length === 0 ? currentTrack : others[Math.floor(Math.random() * others.length)];
    } else {
      const idx = list.findIndex(t => t.id === currentTrack.id);
      return list[(idx + 1) % list.length];
    }
  }, [nowPlayingList, currentViewTracks, tracks, currentTrack, isShuffle]);

  const prevTrack = useMemo(() => {
    const list = nowPlayingList.length > 0 ? nowPlayingList : (currentViewTracks.length > 0 ? currentViewTracks : tracks);
    if (list.length === 0 || !currentTrack) return null;
    
    const idx = list.findIndex(t => t.id === currentTrack.id);
    if (idx === -1) return list[list.length - 1];
    return list[(idx - 1 + list.length) % list.length];
  }, [nowPlayingList, currentViewTracks, tracks, currentTrack]);

  useEffect(() => {
    if (nextTrack) prefetchTrack(nextTrack);
  }, [nextTrack, prefetchTrack]);

  const resetHudTimer = useCallback(() => {
    setIsHudVisible(true);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => {
      if (isPlaying) setIsHudVisible(false);
    }, 3000);
  }, [isPlaying]);

  useEffect(() => {
    if (fullScreenPlayer && isPlaying) {
      resetHudTimer();
      const events = ['mousemove', 'mousedown', 'keydown', 'touchstart'];
      events.forEach(e => window.addEventListener(e, resetHudTimer));
      return () => {
        events.forEach(e => window.removeEventListener(e, resetHudTimer));
        if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
      };
    } else {
      setIsHudVisible(true);
    }
  }, [fullScreenPlayer, isPlaying, resetHudTimer]);

  const loadData = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const [data, orders] = await Promise.all([
          fetchAllTracks(),
          getAlbumOrders()
      ]);
      setAlbumOrders(orders);
      const sanitized = data.map(t => ({...t, artist: cleanArtist(t.artist)}));
      setTracks(sanitized);

      if (isManual) {
          const tracksToRefresh = sanitized.filter(t => t.coverUrl === DEFAULT_COVER || t.artist === "Unknown Artist" || !t.title);
          const batchSize = 3;
          for (let i = 0; i < tracksToRefresh.length; i += batchSize) {
              const currentBatch = tracksToRefresh.slice(i, i + batchSize);
              const batchResults = await Promise.all(currentBatch.map(async (t) => {
                  let updated = await extractMetadataFromTrack(t);
                  return updated;
              }));
              setTracks(prev => {
                  const updatedList = [...prev];
                  batchResults.forEach(updated => {
                      const idx = updatedList.findIndex(track => track.id === updated.id);
                      if (idx !== -1) updatedList[idx] = { ...updated, artist: cleanArtist(updated.artist) };
                  });
                  return updatedList;
              });
          }
      }
    } catch (e) {
      console.error("Library sync failed", e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [cleanArtist]);

  const loadAllCovers = async () => {
    setIsRefreshing(true);
    const batchSize = 4;
    for (let i = 0; i < tracks.length; i += batchSize) {
        const batch = tracks.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(t => extractMetadataFromTrack(t)));
        setTracks(prev => {
            const newList = [...prev];
            results.forEach(res => {
                const idx = newList.findIndex(item => item.id === res.id);
                if (idx !== -1) newList[idx] = { ...res, artist: cleanArtist(res.artist) };
            });
            return newList;
        });
    }
    setIsRefreshing(false);
    alert("Covers updated.");
  };

  useEffect(() => { loadData(); }, [loadData]);

  const handlePlayTrack = useCallback(async (track: Track, customList?: Track[]) => {
    if (customList) setNowPlayingList(customList);
    else if (currentViewTracks.length > 0) setNowPlayingList(currentViewTracks);
    playTrack(track, videoAutoplay);
    if (track.coverUrl === DEFAULT_COVER || track.artist === "Unknown Artist") {
        let enriched = await extractMetadataFromTrack(track);
        const finalEnriched = { ...enriched, artist: cleanArtist(enriched.artist) };
        setTracks(prev => prev.map(t => t.id === enriched.id ? finalEnriched : t));
        setTrackMetadata(finalEnriched);
    }
  }, [playTrack, cleanArtist, currentViewTracks, videoAutoplay, setTrackMetadata]);

  const handleShuffleList = useCallback((list: Track[]) => {
    if (list.length === 0) return;
    const shuffled = [...list].sort(() => Math.random() - 0.5);
    setIsShuffle(true);
    handlePlayTrack(shuffled[0], list);
  }, [handlePlayTrack]);

  const playNext = useCallback(async () => {
    if (nextTrack) {
       handlePlayTrack(nextTrack);
    }
  }, [nextTrack, handlePlayTrack]);

  const playPrev = useCallback(() => {
    if (currentTime > 3) {
        seek(0);
        return;
    }
    const list = nowPlayingList.length > 0 ? nowPlayingList : (currentViewTracks.length > 0 ? currentViewTracks : tracks);
    if (list.length === 0) return;
    const currentIdx = list.findIndex(t => t.id === currentTrack?.id);
    const prevIdx = (currentIdx - 1 + list.length) % list.length;
    handlePlayTrack(list[prevIdx]);
  }, [nowPlayingList, currentViewTracks, tracks, currentTrack, handlePlayTrack, currentTime, seek]);

  useEffect(() => {
    setMediaHandlers(playNext, playPrev);
  }, [playNext, playPrev, setMediaHandlers]);

  useEffect(() => {
    if (isEnded) {
      if (repeatMode === 'one' && currentTrack) { seek(0); togglePlayPause(); }
      else { playNext(); }
    }
  }, [isEnded, repeatMode, currentTrack, playNext, seek, togglePlayPause]);

  const handleCreatePlaylist = (name: string) => {
    const newPlaylist: Playlist = { id: Date.now().toString(), name: name.trim(), tracks: [] };
    setPlaylists(prev => [newPlaylist, ...prev]);
    setCreatePlaylistModal(false);
  };

  const addToPlaylist = (playlistId: string, track: Track) => {
    setPlaylists(prev => prev.map(p => {
      if (p.id === playlistId) {
        if (p.tracks.find(t => t.id === track.id)) return p;
        return { ...p, tracks: [track, ...p.tracks] };
      }
      return p;
    }));
    setPlaylistModal({ isOpen: false, track: null });
  };

  const deletePlaylist = (id: string) => {
    if (confirm("Delete this playlist?")) {
      setPlaylists(prev => prev.filter(p => p.id !== id));
      if (view === 'playlist-detail' && activePlaylistId === id) setView('playlists');
    }
  };

  const formatTime = (time: number) => {
    if (!Number.isFinite(time)) return "0:00";
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const headerTitle = useMemo(() => {
    switch(view) {
        case 'library': return 'Listen Now';
        case 'search': return 'Search';
        case 'playlists': return 'Playlists';
        case 'artists': return 'Artists';
        case 'albums': return 'Albums';
        case 'playlist-detail': return activePlaylist?.name;
        case 'artist-detail': return activeItem;
        case 'album-detail': return activeItem;
        case 'settings': return 'Settings';
        case 'roulette': return 'Roulette';
        case 'games': return 'Arcade';
        default: return 'Music';
    }
  }, [view, activePlaylist, activeItem]);

  const handleAuth = (success: boolean) => {
      if (success) {
          setIsAuthorized(true);
          localStorage.setItem('apple_music_auth', 'true');
          const type = showPasswordModal.type;
          setShowPasswordModal({ type: null });
          if (type === 'upload') fileInputRef.current?.click();
          else if (type === 'reorder') startReordering();
          else if (type === 'youtube') setShowYoutubeModal(true);
          else if (type === 'batch_edit') setShowBatchEditModal(true);
          else if (type === 'edit_info' && pendingTrackRef.current) {
              setEditTrackModal({ isOpen: true, track: pendingTrackRef.current });
              pendingTrackRef.current = null;
          }
          else if (type === 'video' && pendingTrackRef.current) {
              setVideoLinkModal({ isOpen: true, track: pendingTrackRef.current });
              pendingTrackRef.current = null;
          }
      } else {
          alert("Incorrect Password");
      }
  };

  const toggleDevMode = () => {
    if (isAuthorized) {
        setIsAuthorized(false);
        localStorage.removeItem('apple_music_auth');
    } else {
        setShowPasswordModal({ type: 'dev_mode' });
    }
  };

  const initiateUpload = () => {
      if (isAuthorized) fileInputRef.current?.click();
  };

  const initiateYoutubeDownload = () => {
      if (isAuthorized) setShowYoutubeModal(true);
      else setShowPasswordModal({ type: 'youtube' });
  };
  
  const initiateReorder = () => {
      if (isAuthorized) startReordering();
  };

  const handleEditVideo = (track: Track) => {
      if (isAuthorized) setVideoLinkModal({ isOpen: true, track });
  };

  const handleEditTrackInfo = (track: Track) => {
      if (isAuthorized) setEditTrackModal({ isOpen: true, track });
      else {
          pendingTrackRef.current = track;
          setShowPasswordModal({ type: 'edit_info' });
      }
  };
  
  const handleLyricsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const track = lyricsTrackRef.current;
      if (!file || !track) return;
      const text = await file.text();
      await saveTrackLyrics(track.id, text);
      setTracks(prev => prev.map(t => t.id === track.id ? { ...t, lyrics: text } : t));
      alert("Lyrics uploaded!");
      e.target.value = '';
      lyricsTrackRef.current = null;
  };

  const initiateLyricsUpload = (track: Track) => {
      lyricsTrackRef.current = track;
      lyricsInputRef.current?.click();
  };
  
  const startReordering = () => {
      setIsReordering(true);
      setReorderList([...currentViewTracks]);
  };
  
  const saveReorder = async () => {
      if (!activeItem) return;
      const newOrder = reorderList.map(t => t.id);
      setAlbumOrders(prev => ({ ...prev, [activeItem]: newOrder }));
      setIsReordering(false);
      const success = await saveAlbumOrder(activeItem, newOrder);
      if (!success) alert("Failed to save order to server. Changes saved locally.");
  };
  
  const moveTrack = (index: number, direction: 'up' | 'down') => {
      const newList = [...reorderList];
      if (direction === 'up' && index > 0) {
          [newList[index], newList[index - 1]] = [newList[index - 1], newList[index]];
      } else if (direction === 'down' && index < newList.length - 1) {
          [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
      }
      setReorderList(newList);
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setShowUploadMetaModal({ files: Array.from(files) });
    e.target.value = '';
  };

  const performUpload = async (files: File[], metadata: { album?: string, type: 'single' | 'album' }) => {
    setShowUploadMetaModal(null);
    const newUploads: UploadStatus[] = files.map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        filename: file.name,
        progress: 0,
        status: 'pending',
        file: file
    }));
    setUploadQueue(prev => [...prev, ...newUploads]);

    for (const uploadItem of newUploads) {
        setUploadQueue(prev => prev.map(u => u.id === uploadItem.id ? { ...u, status: 'uploading' } : u));
        const success = await uploadTrackWithProgress(uploadItem.file!, (percent) => {
            setUploadQueue(prev => prev.map(u => u.id === uploadItem.id ? { ...u, progress: percent } : u));
        }, metadata);
        setUploadQueue(prev => prev.map(u => u.id === uploadItem.id ? { ...u, status: success ? 'success' : 'error', progress: success ? 100 : 0 } : u));
        setTimeout(() => setUploadQueue(prev => prev.filter(u => u.id !== uploadItem.id)), success ? 3000 : 5000);
    }
    loadData(true);
  };

  const performYoutubeImport = async (url: string, metadata: { album?: string, type: 'single' | 'album' }) => {
      setShowYoutubeModal(false);
      
      const newImport: UploadStatus = {
          id: "import-" + Date.now(),
          filename: "Resolving YouTube Stream...",
          progress: 100,
          status: 'downloading'
      };
      setUploadQueue(prev => [...prev, newImport]);

      const track = await resolveYoutubeProxy(url, metadata);
      
      if (track) {
          await saveImportedTrack(track);
          setUploadQueue(prev => prev.map(u => u.id === newImport.id ? { ...u, status: 'success', filename: `Imported: ${track.title}` } : u));
          setTimeout(() => {
              setUploadQueue(prev => prev.filter(u => u.id !== newImport.id));
              loadData(false);
          }, 2000);
      } else {
          setUploadQueue(prev => prev.map(u => u.id === newImport.id ? { ...u, status: 'error', filename: "Failed to Import" } : u));
          setTimeout(() => setUploadQueue(prev => prev.filter(u => u.id !== newImport.id)), 3000);
      }
  };

  const handleSaveEditTrack = async (trackId: string, info: { title: string, artist: string, album: string }) => {
      const updatedTracks = await saveTrackMetadata(trackId, info);
      const sanitized = updatedTracks.map(t => ({...t, artist: cleanArtist(t.artist)}));
      setTracks(sanitized);
      const current = sanitized.find(t => t.id === trackId);
      if (current) setTrackMetadata(current);
      setEditTrackModal({ isOpen: false, track: null });
  };

  const handleCoverUpload = async (trackId: string, file: File, type: 'static' | 'animated') => {
      setIsLoading(true);
      const success = await uploadTrackWithProgress(file, () => {});
      if (success) {
          const key = `track:${trackId}`;
          if (type === 'animated') {
              await saveAnimatedCoverMapping(key, file.name);
          } else {
              await saveCustomCoverMapping(key, file.name);
          }
          await loadData(false);
          const current = tracks.find(t => t.id === trackId);
          if (current) setTrackMetadata(current);
      }
      setIsLoading(false);
  };

  const activeTrackWithMetadata = useMemo(() => {
      if (!currentTrack) return null;
      return tracks.find(t => t.id === currentTrack.id) || currentTrack;
  }, [currentTrack, tracks]);

  if (isAppLocked) {
      return <AppLockScreen onUnlock={handleAppUnlock} />;
  }

  return (
    <div className="flex h-screen w-full bg-[#000] text-white overflow-hidden font-sans">
      <input type="file" accept="audio/*,.mp3,.lrc" multiple ref={fileInputRef} className="hidden" onChange={handleFilesSelected} />
      <input type="file" accept=".txt,.lrc,text/*" ref={lyricsInputRef} className="hidden" onChange={handleLyricsUpload} />
      
      {showPasswordModal.type && <PasswordModal onClose={() => setShowPasswordModal({ type: null })} onSuccess={() => handleAuth(true)} />}
      
      {playingGame === 'flappy' && gameTrack && <FlappySongGame tracks={tracks} initialTrack={gameTrack} onClose={() => setPlayingGame(null)} />}
      {playingGame === 'rhythm' && gameTrack && <RhythmGame track={gameTrack} difficulty="normal" onClose={() => setPlayingGame(null)} />}
      
      {previewTrack && <SongPreviewModal track={previewTrack} onClose={() => setPreviewTrack(null)} />}
      
      {showBatchLyricsModal && (
        <BatchUploadModal
            albums={albumsList}
            tracks={tracks}
            onClose={() => setShowBatchLyricsModal(false)}
            onSaveLyric={async (trackId: string, text: string) => {
                await saveTrackLyrics(trackId, text);
                setTracks(prev => prev.map(t => t.id === trackId ? { ...t, lyrics: text } : t));
            }}
        />
      )}

      {showYoutubeModal && (
          <YoutubeDownloadModal 
            onClose={() => setShowYoutubeModal(false)} 
            onImport={performYoutubeImport}
          />
      )}

      {showAnimatedCoverModal && (
          <AnimatedCoverModal
            albums={albumsList}
            tracks={tracks}
            onClose={() => setShowAnimatedCoverModal(false)}
            onSaved={() => loadData(false)}
          />
      )}

      {showUploadMetaModal && (
          <UploadMetadataModal 
            onClose={() => setShowUploadMetaModal(null)} 
            onProceed={(metadata) => performUpload(showUploadMetaModal.files, metadata)}
          />
      )}

      {editTrackModal.isOpen && editTrackModal.track && (
          <EditTrackInfoModal
            track={editTrackModal.track}
            onClose={() => setEditTrackModal({ isOpen: false, track: null })}
            onSave={handleSaveEditTrack}
            onUploadCover={handleCoverUpload}
          />
      )}

      {showBatchEditModal && (
          <BatchEditModal 
              count={selectedTrackIds.length}
              onClose={() => setShowBatchEditModal(false)}
              onSave={performBatchUpdate}
              onDelete={performBatchDelete}
          />
      )}

      {showVizMaker && (
          <VisualizerMaker 
            analyser={analyserNode} 
            initialConfig={customVizConfig}
            onClose={() => setShowVizMaker(false)} 
            onSave={(config) => {
                setCustomVizConfig(config);
                localStorage.setItem('apple_music_custom_viz', JSON.stringify(config));
                setVisualizerStyle('custom');
                setShowVizMaker(false);
            }} 
          />
      )}

      <aside className="hidden lg:flex flex-col w-[260px] bg-zinc-900/40 border-r border-white/5 pt-12 px-4 gap-8">
        <div className="flex items-center gap-3 px-2 mb-2">
          <div className="w-8 h-8 bg-[#fa2d48] rounded-lg flex items-center justify-center"><Headphones className="w-5 h-5 text-white" /></div>
          <span className="font-black text-xl tracking-tight">Music</span>
        </div>

        <nav className="space-y-6">
          <div className="space-y-1">
            <h3 className="px-2 text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2">Apple Music</h3>
            <SidebarItem icon={Compass} label="Listen Now" active={view === 'library'} onClick={() => setView('library')} />
          </div>
          <div className="space-y-1">
            <h3 className="px-2 text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2">Library</h3>
            <SidebarItem icon={User} label="Artists" active={view === 'artists'} onClick={() => setView('artists')} />
            <SidebarItem icon={Library} label="Albums" active={view === 'albums'} onClick={() => setView('albums')} />
            <SidebarItem icon={Music} label="Songs" onClick={() => setView('library')} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2 mb-2">
              <h3 className="text-[11px] font-black text-zinc-500 uppercase tracking-widest">Playlists</h3>
              <Plus className="w-4 h-4 text-[#fa2d48] cursor-pointer" onClick={() => setCreatePlaylistModal(true)} />
            </div>
            {playlists.map(p => (
              <SidebarItem key={p.id} icon={Music} label={p.name} active={activePlaylistId === p.id && view === 'playlist-detail'} onClick={() => { setActivePlaylistId(p.id); setView('playlist-detail'); }} />
            ))}
          </div>
        </nav>

        <div className="mt-auto pb-8 space-y-2">
          <SidebarItem icon={Search} label="Search" active={view === 'search'} onClick={() => setView('search')} />
          <SidebarItem icon={Settings} label="Settings" active={view === 'settings'} onClick={() => setView('settings')} />
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative overflow-hidden bg-black">
        <header className="flex items-center justify-between px-8 pt-10 pb-6 sticky top-0 bg-black/80 backdrop-blur-xl z-20">
          <div className="flex items-center gap-4">
            {['playlist-detail', 'artist-detail', 'album-detail', 'settings', 'search', 'games'].includes(view) && (
              <button onClick={() => { setView('library'); setIsReordering(false); cancelSelection(); }} className="p-2 -ml-2 lg:hidden"><ChevronLeft className="w-8 h-8 text-[#fa2d48]" /></button>
            )}
            <h1 className="text-4xl font-extrabold tracking-tight flex items-center gap-3">{headerTitle}</h1>
          </div>
          <div className="flex items-center gap-4">
            {['library', 'playlist-detail', 'artist-detail', 'album-detail'].includes(view) && (
                <button 
                    onClick={isSelectionMode ? cancelSelection : startSelectionMode}
                    className={`px-4 py-2 rounded-full font-bold text-sm transition-all ${isSelectionMode ? 'bg-[#fa2d48] text-white' : 'bg-zinc-900/60 text-white border border-white/5'}`}
                >
                    {isSelectionMode ? 'Cancel' : 'Select'}
                </button>
            )}
            {isAuthorized && (
              <button onClick={initiateUpload} className={`p-3 bg-zinc-900/60 rounded-full active-scale transition-all ${isUploading ? 'opacity-100 ring-2 ring-[#fa2d48] animate-pulse' : 'opacity-100'}`}>
                <Upload className="w-5 h-5 text-[#fa2d48]" />
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 pb-40 no-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-40 gap-4"><Loader2 className="w-10 h-10 text-[#fa2d48] animate-spin" /></div>
          ) : view === 'library' ? (
            <DashboardView 
                tracks={tracks} 
                playlists={playlists} 
                artists={artistsList} 
                albums={albumsList}
                isAnimatedCoversEnabled={isAnimatedCoversEnabled}
                onPlayTrack={isSelectionMode ? (t: Track) => toggleTrackSelection(t.id) : (t: Track) => handlePlayTrack(t, tracks)} 
                onPlaylistClick={(p: Playlist) => { setActivePlaylistId(p.id); setView('playlist-detail'); }}
                onArtistClick={(a: string) => { setActiveItem(a); setView('artist-detail'); }}
                onAlbumClick={(al: any) => { setActiveItem(al); setView('album-detail'); setIsReordering(false); }}
                cleanTitle={cleanTitle}
                cleanArtist={cleanArtist}
                onPreview={(t: Track) => setPreviewTrack(t)}
                isSelectionMode={isSelectionMode}
                selectedIds={selectedTrackIds}
            />
          ) : view === 'roulette' ? (
            <RouletteView tracks={tracks} isAnimatedCoversEnabled={isAnimatedCoversEnabled} onPlay={(t: Track) => handlePlayTrack(t, tracks)} />
          ) : view === 'games' ? (
            <GamesView 
                tracks={tracks} 
                onPlayFlappy={() => { setGameTrack(currentTrack || tracks[0] || null); setPlayingGame('flappy'); }}
                onPlayRhythm={(t: Track) => { setGameTrack(t); setPlayingGame('rhythm'); }}
                onBack={() => setView('search')}
                cleanTitle={cleanTitle}
                cleanArtist={cleanArtist}
            />
          ) : view === 'search' ? (
            <div className="flex flex-col gap-10 animate-in fade-in duration-500 max-w-4xl mx-auto pt-4">
                <div className="relative">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-zinc-500" />
                    <input autoFocus type="text" placeholder="Artists, Songs, Lyrics, and More" className="w-full bg-zinc-800/40 backdrop-blur-md border-none rounded-3xl py-6 pl-16 pr-16 text-xl font-medium focus:ring-4 focus:ring-[#fa2d48]/20 transition-all placeholder:text-zinc-600" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-6 top-1/2 -translate-y-1/2 p-2 bg-zinc-700/50 rounded-full"><X className="w-4 h-4 text-zinc-300" /></button>}
                </div>
                {searchQuery.trim().toLowerCase() === 'roulette' && (
                    <div onClick={() => setView('roulette')} className="bg-gradient-to-r from-red-600 to-orange-600 p-8 rounded-3xl cursor-pointer active-scale shadow-2xl animate-in zoom-in">
                        <div className="flex items-center gap-4 text-white"><Dices className="w-12 h-12" /><div><h3 className="text-2xl font-black uppercase tracking-wider">Secret Unlocked</h3><p className="font-medium opacity-90">Tap to enter the Roulette</p></div></div>
                    </div>
                )}
                {searchQuery.trim().toLowerCase() === 'games' && (
                    <div onClick={() => setView('games')} className="bg-gradient-to-r from-violet-600 to-indigo-600 p-8 rounded-3xl cursor-pointer active-scale shadow-2xl animate-in zoom-in">
                        <div className="flex items-center gap-4 text-white"><Gamepad2 className="w-12 h-12" /><div><h3 className="text-2xl font-black uppercase tracking-wider">Arcade Zone</h3><p className="font-medium opacity-90">Rhythm & Flappy Games</p></div></div>
                    </div>
                )}
                {!searchQuery ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {['Pop', 'Hip-Hop', 'Electronic', 'Classical', 'Jazz', 'Rock'].map(genre => (
                            <div key={genre} className="h-40 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 p-6 flex flex-col justify-end active-scale border border-white/5 shadow-xl"><span className="font-black text-xl uppercase tracking-tighter">{genre}</span></div>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
                            {currentViewTracks.map(t => (
                                <TrackItem key={t.id} track={t} isAnimatedCoversEnabled={isAnimatedCoversEnabled} cleanTitle={cleanTitle} cleanArtist={cleanArtist} onPlay={isSelectionMode ? () => toggleTrackSelection(t.id) : () => handlePlayTrack(t, currentViewTracks)} onEditVideo={isAuthorized ? () => handleEditVideo(t) : undefined} onEditInfo={() => handleEditTrackInfo(t)} onAddToPlaylist={() => setPlaylistModal({ isOpen: true, track: t })} isActive={currentTrack?.id === t.id} onPreview={() => setPreviewTrack(t)} isSelected={selectedTrackIds.includes(t.id)} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
          ) : view === 'artists' ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-8">
                {artistsList.map(artist => (
                    <div key={artist} onClick={() => { setActiveItem(artist); setView('artist-detail'); }} className="flex flex-col items-center gap-4 active-scale text-center">
                        <div className="w-full aspect-square rounded-full bg-zinc-900 flex items-center justify-center overflow-hidden shadow-2xl border-4 border-white/5"><User className="w-20 h-20 text-zinc-700" /></div>
                        <p className="font-bold text-lg truncate w-full">{artist}</p>
                    </div>
                ))}
            </div>
          ) : view === 'albums' ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-8">
                {albumsList.map(album => (
                    <div key={album.name} onClick={() => { setActiveItem(album.name); setView('album-detail'); setIsReordering(false); }} className="space-y-3 active-scale">
                        <div className="relative w-full aspect-square rounded-2xl overflow-hidden shadow-2xl border border-white/5">
                            <img src={(isAnimatedCoversEnabled && album.animatedCover) ? album.animatedCover : (album.cover || DEFAULT_COVER)} className="w-full h-full object-cover" />
                        </div>
                        <div className="px-1"><p className="font-bold text-md truncate">{album.name}</p><p className="text-sm text-zinc-500 truncate">{album.artist}</p></div>
                    </div>
                ))}
            </div>
          ) : view === 'settings' ? (
            <SettingsView 
                tracksCount={tracks.length} 
                onReset={() => loadData(true)} 
                onSync={() => loadData(true)} 
                onLoadCovers={loadAllCovers}
                onOpenEq={() => setIsEqOpen(true)} 
                onOpenVizMaker={() => setShowVizMaker(true)}
                onUpload={initiateUpload}
                onYoutubeDownload={initiateYoutubeDownload}
                isRefreshing={isRefreshing} 
                visualizerStyle={visualizerStyle}
                onSetVisualizerStyle={changeVisualizerStyle}
                videoAutoplay={videoAutoplay}
                onToggleVideoAutoplay={() => {
                    setVolume(0.5);
                    setVideoAutoplay(!videoAutoplay);
                    localStorage.setItem('apple_clone_video_autoplay', String(!videoAutoplay));
                }}
                isAnimatedCoversEnabled={isAnimatedCoversEnabled}
                onToggleAnimatedCovers={() => {
                    setIsAnimatedCoversEnabled(!isAnimatedCoversEnabled);
                    localStorage.setItem('apple_clone_animated_covers_enabled', String(!isAnimatedCoversEnabled));
                }}
                isAuthorized={isAuthorized}
                onToggleAuth={toggleDevMode}
                lyricsOffset={lyricsOffset}
                onSetLyricsOffset={changeLyricsOffset}
                onOpenBatchLyrics={() => setShowBatchLyricsModal(true)}
                onOpenAnimatedCovers={() => setShowAnimatedCoverModal(true)}
            />
          ) : (
            <div className="flex flex-col gap-10">
                {!isSelectionMode && ['playlist-detail', 'artist-detail', 'album-detail'].includes(view) && (
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-4 max-w-xl">
                            <button onClick={() => handlePlayTrack(currentViewTracks[0], currentViewTracks)} className="flex-1 flex items-center justify-center gap-2 bg-[#fa2d48] text-white py-4 rounded-2xl font-bold active-scale shadow-lg"><Play className="w-5 h-5 fill-current" /> Play</button>
                            <button onClick={() => handleShuffleList(currentViewTracks)} className="flex-1 flex items-center justify-center gap-2 bg-zinc-900/60 text-white py-4 rounded-2xl font-bold border border-white/5 active-scale backdrop-blur-md"><Shuffle className="w-5 h-5" /> Shuffle</button>
                            {view === 'album-detail' && isAuthorized && (
                                <button onClick={isReordering ? saveReorder : initiateReorder} className={`px-4 py-4 rounded-2xl font-bold border border-white/5 active-scale backdrop-blur-md flex items-center justify-center gap-2 ${isReordering ? 'bg-green-600 text-white' : 'bg-zinc-900/60 text-white'}`}>{isReordering ? <Save className="w-5 h-5" /> : <List className="w-5 h-5" />}{isReordering ? 'Save' : ''}</button>
                            )}
                        </div>
                        {isReordering && (
                            <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl text-yellow-500 text-sm font-bold flex items-center gap-3"><Info className="w-5 h-5" /><span>Editing Album Order. Use arrows to move tracks.</span><button onClick={() => setIsReordering(false)} className="ml-auto underline">Cancel</button></div>
                        )}
                    </div>
                )}
                {isReordering ? (
                     <div className="flex flex-col gap-2">
                        {reorderList.map((t, index) => (
                            <div key={t.id} className="flex items-center gap-4 p-3 bg-zinc-900/40 rounded-xl border border-white/5">
                                <div className="flex flex-col gap-1">
                                    <button onClick={() => moveTrack(index, 'up')} disabled={index === 0} className="p-1 hover:bg-white/10 rounded disabled:opacity-30"><ArrowUp className="w-5 h-5" /></button>
                                    <button onClick={() => moveTrack(index, 'down')} disabled={index === reorderList.length - 1} className="p-1 hover:bg-white/10 rounded disabled:opacity-30"><ArrowDown className="w-5 h-5" /></button>
                                </div>
                                <img src={(isAnimatedCoversEnabled && t.animatedCoverUrl) ? t.animatedCoverUrl : t.coverUrl} className="w-12 h-12 rounded-lg object-cover" />
                                <div className="flex-1 min-w-0"><p className="font-bold truncate">{cleanTitle(t.title)}</p><p className="text-sm text-zinc-500 truncate">{cleanArtist(t.artist)}</p></div>
                                <div className="text-zinc-500 font-mono text-xs">{index + 1}</div>
                            </div>
                        ))}
                     </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-8">
                        {view === 'playlist-detail' && activePlaylist && (
                            <button onClick={() => deletePlaylist(activePlaylist.id)} className="col-span-full p-4 bg-zinc-900/40 text-red-500 rounded-2xl font-bold flex items-center justify-center gap-2 border border-white/5 active-scale backdrop-blur-md"><Trash2 className="w-5 h-5" /> Delete Playlist</button>
                        )}
                        {currentViewTracks.map((t, index) => (
                            <TrackItem key={t.id} track={t} isAnimatedCoversEnabled={isAnimatedCoversEnabled} cleanTitle={cleanTitle} cleanArtist={cleanArtist} onPlay={isSelectionMode ? () => toggleTrackSelection(t.id) : () => handlePlayTrack(t, currentViewTracks)} onEditVideo={isAuthorized ? () => handleEditVideo(t) : undefined} onEditInfo={() => handleEditTrackInfo(t)} onAddToPlaylist={() => setPlaylistModal({ isOpen: true, track: t })} isActive={currentTrack?.id === t.id} orderIndex={view === 'album-detail' ? index + 1 : undefined} onPreview={() => setPreviewTrack(t)} isSelected={selectedTrackIds.includes(t.id)} />
                        ))}
                    </div>
                )}
            </div>
          )}
        </div>
        
        {isSelectionMode && (
            <div className="fixed bottom-[100px] left-1/2 -translate-x-1/2 z-[150] w-[90%] max-w-lg bg-zinc-900/90 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 shadow-2xl flex items-center justify-between animate-in slide-in-from-bottom-12 duration-300">
                <div className="flex items-center gap-4 px-2">
                    <span className="bg-[#fa2d48] text-white text-xs font-black px-2 py-1 rounded-lg">{selectedTrackIds.length}</span>
                    <span className="font-bold text-sm">Selected</span>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={handleBatchEdit}
                        disabled={selectedTrackIds.length === 0}
                        className="px-5 py-2.5 bg-zinc-800 text-white font-bold rounded-2xl flex items-center gap-2 active-scale disabled:opacity-30 disabled:grayscale"
                    >
                        <Edit className="w-4 h-4" /> Edit
                    </button>
                    <button onClick={cancelSelection} className="p-2.5 bg-white/5 text-zinc-400 rounded-2xl hover:text-white"><X className="w-5 h-5" /></button>
                </div>
            </div>
        )}

        {uploadQueue.length > 0 && (
            <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 w-80 pointer-events-none">
                {uploadQueue.map(item => (
                    <div key={item.id} className="bg-zinc-900/90 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl animate-in slide-in-from-right duration-300 pointer-events-auto">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="p-2 bg-white/5 rounded-lg">
                                    {item.status === 'downloading' ? <Youtube className="w-4 h-4 text-red-500" /> : <FileMusic className="w-4 h-4 text-zinc-400" />}
                                </div>
                                <span className="font-bold text-sm truncate">{item.filename}</span>
                            </div>
                            {(item.status === 'uploading' || item.status === 'downloading') && <Loader2 className="w-4 h-4 animate-spin text-[#fa2d48]" />}
                            {item.status === 'success' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                            {item.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                        </div>
                        <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                            <div 
                                className={`h-full transition-all duration-200 ${item.status === 'error' ? 'bg-red-500' : item.status === 'success' ? 'bg-green-500' : item.status === 'downloading' ? 'bg-red-600 animate-pulse' : 'bg-[#fa2d48]'}`} 
                                style={{ width: `${item.status === 'downloading' ? 100 : item.progress}%` }} 
                            />
                        </div>
                        {item.status === 'downloading' && <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-widest font-black">Importing stream...</p>}
                    </div>
                ))}
            </div>
        )}

        {!fullScreenPlayer && activeTrackWithMetadata && !isSelectionMode && (
          <div onClick={() => setFullScreenPlayer(true)} className="absolute bottom-6 left-8 right-8 h-20 bg-zinc-900/60 backdrop-blur-3xl rounded-2xl border border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.5)] flex items-center px-4 gap-4 z-[60] active-scale group">
              <img src={(isAnimatedCoversEnabled && activeTrackWithMetadata.animatedCoverUrl) ? activeTrackWithMetadata.animatedCoverUrl : activeTrackWithMetadata.coverUrl} className="w-14 h-14 rounded-xl object-cover shadow-2xl group-hover:scale-105 transition-transform" />
              <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-bold truncate text-[16px] text-white/95 leading-tight">{cleanTitle(activeTrackWithMetadata.title)}</span>
                  <span className="text-[14px] text-white/40 truncate font-medium">{cleanArtist(activeTrackWithMetadata.artist)}</span>
              </div>
              <div className="flex items-center gap-2">
                  <button onClick={e => { e.stopPropagation(); setIsShuffle(!isShuffle); }} className={`w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/5 ${isShuffle ? 'text-[#fa2d48]' : 'text-zinc-500'}`}><Shuffle className="w-6 h-6" /></button>
                  <button onClick={e => { e.stopPropagation(); togglePlayPause(); }} className="w-12 h-12 flex items-center justify-center bg-white/5 rounded-full">
                      {isBuffering ? <Loader2 className="w-6 h-6 animate-spin text-[#fa2d48]" /> : isPlaying ? <Pause className="w-10 h-10 fill-current" /> : <Play className="w-10 h-10 fill-current ml-1" />}
                  </button>
                  <button onClick={e => { e.stopPropagation(); playNext(); }} className="w-12 h-12 flex items-center justify-center hover:bg-white/5 rounded-full"><SkipForward className="w-8 h-8 fill-current" /></button>
              </div>
          </div>
        )}

        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-black/70 backdrop-blur-3xl border-t border-white/5 flex items-center justify-around h-[84px] pb-6 px-4 z-[50] safe-bottom">
            <BottomNavItem icon={Compass} label="Listen Now" active={view === 'library'} onClick={() => setView('library')} />
            <BottomNavItem icon={Music} label="Playlists" active={view === 'playlists'} onClick={() => setView('playlists')} />
            <BottomNavItem icon={Search} label="Search" active={view === 'search'} onClick={() => setView('search')} />
        </nav>

        {playlistModal.isOpen && playlistModal.track && <PlaylistModal playlists={playlists} onAdd={(pid: string) => addToPlaylist(pid, playlistModal.track!)} onClose={() => setPlaylistModal({ isOpen: false, track: null })} />}
        {createPlaylistModal && <CreatePlaylistModal onSubmit={handleCreatePlaylist} onClose={() => setCreatePlaylistModal(false)} />}
        {videoLinkModal.isOpen && videoLinkModal.track && <VideoLinkModal track={videoLinkModal.track} onClose={() => setVideoLinkModal({ isOpen: false, track: null })} onSave={async (id: string, url: string) => {
                const updated = await saveTrackVideoUrl(id, url);
                const sanitized = updated.map(t => ({...t, artist: cleanArtist(t.artist)}));
                setTracks(sanitized);
                const current = sanitized.find(t => t.id === id);
                if (current) setTrackMetadata(current);
                setVideoLinkModal({ isOpen: false, track: null });
        }} />}
        {isEqOpen && <Equalizer settings={equalizerSettings} onChange={setEqualizerSettings} onClose={() => setIsEqOpen(false)} />}
        {fullScreenPlayer && activeTrackWithMetadata && (
          <FullPlayerUI 
              track={activeTrackWithMetadata} isPlaying={isPlaying} isBuffering={isBuffering} isHudVisible={isHudVisible} currentTime={currentTime} duration={duration} volume={volume} mode={mode} isShuffle={isShuffle} repeatMode={repeatMode} analyserNode={analyserNode} visualizerStyle={visualizerStyle} isAnimatedCoversEnabled={isAnimatedCoversEnabled} customVizConfig={customVizConfig}
              onClose={() => setFullScreenPlayer(false)} onTogglePlay={togglePlayPause} onSeek={seek} onPrev={playPrev} onNext={playNext} onSetVolume={setVolume} onSetShuffle={setIsShuffle} onSetRepeat={() => setRepeatMode(repeatMode === 'none' ? 'all' : repeatMode === 'all' ? 'one' : 'none')} onOpenEq={() => setIsEqOpen(true)} onSetMode={setMode} registerVideo={registerVideo} unregisterVideo={unregisterVideo} cleanTitle={cleanTitle} cleanArtist={cleanArtist} formatTime={formatTime}
              onUploadLyrics={isAuthorized ? () => initiateLyricsUpload(activeTrackWithMetadata) : undefined}
              onEditInfo={() => handleEditTrackInfo(activeTrackWithMetadata)}
              lyricsOffset={lyricsOffset}
              onTogglePiP={requestPiP}
              isPipActive={isPipActive}
          />
        )}
      </main>
    </div>
  );
}

function AppLockScreen({ onUnlock }: { onUnlock: (pass: string) => void }) {
    const [pass, setPass] = useState("");
    return (
        <div className="fixed inset-0 z-[500] bg-black flex flex-col items-center justify-center p-6 animate-in fade-in duration-700">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#fa2d48]/20 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/20 blur-[120px] rounded-full animate-pulse delay-700" />
            </div>
            
            <div className="relative flex flex-col items-center gap-12 w-full max-sm text-center">
                <div className="w-24 h-24 bg-[#fa2d48] rounded-3xl flex items-center justify-center shadow-2xl shadow-red-600/40">
                    <Headphones className="w-12 h-12 text-white" />
                </div>
                
                <div className="space-y-2">
                    <h1 className="text-4xl font-black tracking-tighter text-white">Apple Music</h1>
                    <p className="text-zinc-500 font-medium">Please enter your access code</p>
                </div>

                <div className="w-full space-y-6">
                    <input 
                        type="password" 
                        autoFocus
                        placeholder="••••"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 text-center text-3xl tracking-[1em] focus:ring-4 focus:ring-[#fa2d48]/20 transition-all outline-none text-white"
                        value={pass}
                        onChange={e => setPass(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && onUnlock(pass)}
                    />
                    <button 
                        onClick={() => onUnlock(pass)}
                        className="w-full bg-white text-black py-5 rounded-2xl font-black text-lg active-scale shadow-xl hover:bg-zinc-200 transition-colors"
                    >
                        Unlock Library
                    </button>
                </div>
                
                <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-widest mt-4">Protected Session</p>
            </div>
        </div>
    );
}

function EditTrackInfoModal({ track, onClose, onSave, onUploadCover }: { track: Track, onClose: () => void, onSave: (id: string, info: { title: string, artist: string, album: string }) => void, onUploadCover: (id: string, file: File, type: 'static' | 'animated') => void }) {
    const [title, setTitle] = useState(track.title);
    const [artist, setArtist] = useState(track.artist);
    const [album, setAlbum] = useState(track.album);
    const [coverType, setCoverType] = useState<'static' | 'animated'>('static');
    const [isSaving, setIsSaving] = useState(false);
    const coverInputRef = useRef<HTMLInputElement>(null);

    const handleSave = async () => {
        setIsSaving(true);
        await onSave(track.id, { title, artist, album });
        setIsSaving(false);
    };

    const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onUploadCover(track.id, file, coverType);
        }
    };

    return (
        <div className="fixed inset-0 z-[250] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-zinc-900/90 border border-white/10 w-full max-w-lg rounded-[32px] p-8 shadow-2xl space-y-6 animate-in zoom-in slide-in-from-bottom-8">
                <input type="file" ref={coverInputRef} className="hidden" accept={coverType === 'animated' ? '.gif' : 'image/*'} onChange={handleCoverChange} />
                
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-black flex items-center gap-3">
                        <Edit className="w-6 h-6 text-[#fa2d48]" />
                        Edit Metadata
                    </h2>
                    <button onClick={onClose} className="p-2 bg-white/5 rounded-full hover:bg-white/10"><X className="w-5 h-5 text-zinc-400" /></button>
                </div>

                <div className="flex flex-col md:flex-row gap-8">
                    <div className="flex flex-col items-center gap-4 shrink-0">
                        <div 
                            onClick={() => coverInputRef.current?.click()}
                            className="group relative w-40 h-40 rounded-2xl overflow-hidden cursor-pointer bg-black border border-white/10 shadow-2xl active-scale"
                        >
                            <img src={coverType === 'animated' ? (track.animatedCoverUrl || track.coverUrl) : track.coverUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-center p-2">
                                <Camera className="w-8 h-8 mb-1" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Change {coverType === 'animated' ? 'GIF' : 'Image'}</span>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 p-1 bg-black/40 rounded-xl border border-white/5 w-full">
                            <button onClick={() => setCoverType('static')} className={`py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${coverType === 'static' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500'}`}>Static</button>
                            <button onClick={() => setCoverType('animated')} className={`py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${coverType === 'animated' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500'}`}>Animated</button>
                        </div>
                    </div>

                    <div className="flex-1 space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Song Title</label>
                            <input 
                                type="text" value={title} onChange={e => setTitle(e.target.value)}
                                className="w-full bg-black/50 border border-white/5 rounded-2xl py-3 px-5 focus:ring-2 focus:ring-[#fa2d48] outline-none transition-all"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Artist</label>
                            <input 
                                type="text" value={artist} onChange={e => setArtist(e.target.value)}
                                className="w-full bg-black/50 border border-white/5 rounded-2xl py-3 px-5 focus:ring-2 focus:ring-[#fa2d48] outline-none transition-all"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Album</label>
                            <input 
                                type="text" value={album} onChange={e => setAlbum(e.target.value)}
                                className="w-full bg-black/50 border border-white/5 rounded-2xl py-3 px-5 focus:ring-2 focus:ring-[#fa2d48] outline-none transition-all"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex gap-4">
                    <button onClick={onClose} className="flex-1 py-4 bg-zinc-800 text-white rounded-2xl font-bold active-scale">Cancel</button>
                    <button 
                        onClick={handleSave} disabled={isSaving}
                        className="flex-[2] py-4 bg-[#fa2d48] text-white rounded-2xl font-black text-lg active-scale shadow-2xl shadow-red-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : "Apply Info"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function BatchEditModal({ count, onClose, onSave, onDelete }: { count: number, onClose: () => void, onSave: (meta: { title?: string, artist?: string, album?: string }, coverFile?: File, coverType?: 'static' | 'animated') => void, onDelete: () => void }) {
    const [title, setTitle] = useState("");
    const [artist, setArtist] = useState("");
    const [album, setAlbum] = useState("");
    const [coverType, setCoverType] = useState<'static' | 'animated'>('static');
    const [coverFile, setCoverFile] = useState<File | undefined>(undefined);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);
    const coverInputRef = useRef<HTMLInputElement>(null);

    const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setCoverFile(file);
            const reader = new FileReader();
            reader.onload = (e) => setCoverPreview(e.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="fixed inset-0 z-[250] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-zinc-900/90 border border-white/10 w-full max-w-md rounded-[32px] p-10 shadow-2xl space-y-8 animate-in zoom-in slide-in-from-bottom-12">
                <input type="file" ref={coverInputRef} className="hidden" accept={coverType === 'animated' ? '.gif' : 'image/*'} onChange={handleCoverChange} />
                
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h2 className="text-3xl font-black tracking-tighter">Batch Edit</h2>
                        <button onClick={onClose} className="p-2 bg-white/5 rounded-full"><X className="w-5 h-5" /></button>
                    </div>
                    <p className="text-zinc-500 font-bold uppercase text-[10px] tracking-widest">Editing {count} tracks simultaneously</p>
                </div>

                <div className="space-y-6">
                    <div className="space-y-4 flex flex-col items-center">
                        <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest px-2 w-full text-center">Global Artwork</label>
                        
                        <div 
                            onClick={() => coverInputRef.current?.click()}
                            className="group relative w-32 h-32 rounded-2xl overflow-hidden cursor-pointer bg-black/40 border border-white/10 shadow-2xl active-scale"
                        >
                            {coverPreview ? (
                                <img src={coverPreview} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 group-hover:text-[#fa2d48] transition-colors">
                                    <ImageIcon className="w-10 h-10 mb-1" />
                                    <span className="text-[9px] font-black uppercase">Add {coverType === 'animated' ? 'GIF' : 'Image'}</span>
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Camera className="w-6 h-6" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 p-1 bg-black/40 rounded-xl border border-white/5 w-48">
                            <button onClick={() => setCoverType('static')} className={`py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${coverType === 'static' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500'}`}>Static</button>
                            <button onClick={() => setCoverType('animated')} className={`py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${coverType === 'animated' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500'}`}>Animated</button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center justify-between px-2">
                            <span className="text-[11px] font-black text-zinc-500 uppercase tracking-widest">Global Artist</span>
                            {artist && <CheckCircle2 className="w-4 h-4 text-blue-500 animate-in zoom-in" />}
                        </label>
                        <input 
                            type="text" placeholder="Change Artist for all..." 
                            className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-6 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            value={artist} onChange={e => setArtist(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center justify-between px-2">
                            <span className="text-[11px] font-black text-zinc-500 uppercase tracking-widest">Global Album</span>
                            {album && <CheckCircle2 className="w-4 h-4 text-blue-500 animate-in zoom-in" />}
                        </label>
                        <input 
                            type="text" placeholder="Change Album for all..." 
                            className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-6 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            value={album} onChange={e => setAlbum(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center justify-between px-2">
                            <span className="text-[11px] font-black text-zinc-500 uppercase tracking-widest">Global Title</span>
                            {title && <CheckCircle2 className="w-4 h-4 text-blue-500 animate-in zoom-in" />}
                        </label>
                        <input 
                            type="text" placeholder="Change Title for all (Caution)..." 
                            className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-6 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            value={title} onChange={e => setTitle(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-4">
                    <div className="flex gap-4">
                        <button onClick={onClose} className="flex-1 py-4 bg-zinc-800 text-white rounded-2xl font-bold active-scale">Cancel</button>
                        <button 
                            disabled={!artist && !album && !title && !coverFile}
                            onClick={() => onSave({ artist, album, title }, coverFile, coverType)} 
                            className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-600/20 active-scale disabled:opacity-20"
                        >
                            Apply Changes
                        </button>
                    </div>
                    
                    <div className="pt-4 border-t border-white/5">
                        <button 
                            onClick={onDelete}
                            className="w-full py-4 bg-red-600/10 text-red-500 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-red-600/20 active-scale transition-all"
                        >
                            <Trash2 className="w-5 h-5" /> Delete {count} Tracks
                        </button>
                    </div>
                </div>
                <p className="text-center text-[10px] text-zinc-600 font-medium">Fields left empty will preserve individual track data.</p>
            </div>
        </div>
    );
}

function SettingsView({ tracksCount, onReset, onSync, onLoadCovers, onOpenEq, onOpenVizMaker, onUpload, onYoutubeDownload, isRefreshing, visualizerStyle, onSetVisualizerStyle, videoAutoplay, onToggleVideoAutoplay, isAnimatedCoversEnabled, onToggleAnimatedCovers, isAuthorized, onToggleAuth, lyricsOffset, onSetLyricsOffset, onOpenBatchLyrics, onOpenAnimatedCovers }: any) {
    return (
    <div className="max-w-2xl mx-auto space-y-8 p-4">
        <div className="bg-zinc-900/50 rounded-2xl p-6 space-y-6">
            <h3 className="text-xl font-bold border-b border-white/5 pb-4">General</h3>
            <div className="flex items-center justify-between">
                <div>
                    <p className="font-medium">Developer Mode</p>
                    <p className="text-sm text-zinc-500">{isAuthorized ? "Enabled (Admin)" : "Disabled"}</p>
                </div>
                <button onClick={onToggleAuth} className={`w-12 h-7 rounded-full transition-colors relative ${isAuthorized ? 'bg-[#fa2d48]' : 'bg-zinc-700'}`}>
                    <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform flex items-center justify-center ${isAuthorized ? 'translate-x-5' : ''}`}>
                         {isAuthorized ? <Unlock className="w-3 h-3 text-[#fa2d48]" /> : <Lock className="w-3 h-3 text-zinc-700" />}
                    </div>
                </button>
            </div>
            <div className="flex items-center justify-between">
                <div>
                    <p className="font-medium">Animated Covers</p>
                    <p className="text-sm text-zinc-500">Show GIF album art where available</p>
                </div>
                <button onClick={onToggleAnimatedCovers} className={`w-12 h-7 rounded-full transition-colors relative ${isAnimatedCoversEnabled ? 'bg-green-500' : 'bg-zinc-700'}`}>
                    <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${isAnimatedCoversEnabled ? 'translate-x-5' : ''}`} />
                </button>
            </div>
        </div>

        <div className="bg-zinc-900/50 rounded-2xl p-6 space-y-6">
            <h3 className="text-xl font-bold border-b border-white/5 pb-4">Studio</h3>
            <div className="flex items-center justify-between">
                <div>
                    <p className="font-medium">Visualizer Studio</p>
                    <p className="text-sm text-zinc-500">Create your own reactive visualizer</p>
                </div>
                <button onClick={onOpenVizMaker} className="px-6 py-2 bg-[#fa2d48] rounded-full font-bold text-sm flex items-center gap-2">
                    <Palette className="w-4 h-4" /> Open Studio
                </button>
            </div>
        </div>

        <div className="bg-zinc-900/50 rounded-2xl p-6 space-y-6">
            <h3 className="text-xl font-bold border-b border-white/5 pb-4">Library</h3>
            <div className="flex items-center justify-between">
                <div>
                    <p className="font-medium">Total Tracks</p>
                    <p className="text-sm text-zinc-500">{tracksCount} songs</p>
                </div>
                <button onClick={onSync} disabled={isRefreshing} className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 disabled:opacity-50">
                    <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
            </div>
             <div className="flex items-center justify-between">
                <div>
                    <p className="font-medium">Reload Artworks</p>
                    <p className="text-sm text-zinc-500">Repopulate album cover store</p>
                </div>
                <button onClick={onLoadCovers} disabled={isRefreshing} className="px-4 py-2 bg-zinc-800 rounded-lg font-bold text-sm hover:bg-zinc-700 transition-colors flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-[#fa2d48]" /> Load all album covers
                </button>
            </div>
             {isAuthorized && (
                 <>
                    <div className="flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                        <div>
                            <p className="font-medium">Upload Music</p>
                            <p className="text-sm text-zinc-500">Add MP3s or LRCs to your library</p>
                        </div>
                        <button onClick={onUpload} className="px-4 py-2 bg-zinc-800 rounded-lg font-bold text-sm">Upload</button>
                    </div>
                    <div className="flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                        <div>
                            <p className="font-medium">YouTube Importer</p>
                            <p className="text-sm text-zinc-500">Stream audio from YouTube (No backend)</p>
                        </div>
                        <button onClick={onYoutubeDownload} className="px-4 py-2 bg-red-600/10 text-red-500 rounded-lg font-bold text-sm flex items-center gap-2">
                            <Youtube className="w-4 h-4" /> Import
                        </button>
                    </div>
                    <div className="flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                        <div>
                            <p className="font-medium">Manage Animated Covers</p>
                            <p className="text-sm text-zinc-500">Upload GIFs for albums or tracks</p>
                        </div>
                        <button onClick={onOpenAnimatedCovers} className="px-4 py-2 bg-zinc-800 rounded-lg font-bold text-sm flex items-center gap-2">
                            <ImageIcon className="w-4 h-4" /> Manage
                        </button>
                    </div>
                    <div className="flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                        <div>
                            <p className="font-medium">Batch Lyric Upload</p>
                            <p className="text-sm text-zinc-500">Assign lyrics to albums</p>
                        </div>
                        <button onClick={onOpenBatchLyrics} className="px-4 py-2 bg-zinc-800 rounded-lg font-bold text-sm">Batch Lyrics</button>
                    </div>
                 </>
             )}
            <div className="flex items-center justify-between">
                <div>
                    <p className="font-medium">Reset Library</p>
                    <p className="text-sm text-zinc-500">Clear metadata cache</p>
                </div>
                <button onClick={() => { if(confirm("Reset cache?")) onReset(); }} className="px-4 py-2 bg-red-500/10 text-red-500 rounded-lg font-bold text-sm">Reset</button>
            </div>
        </div>

        <div className="bg-zinc-900/50 rounded-2xl p-6 space-y-6">
            <h3 className="text-xl font-bold border-b border-white/5 pb-4">Playback</h3>
             <div className="flex items-center justify-between">
                <div>
                    <p className="font-medium">Equalizer</p>
                    <p className="text-sm text-zinc-500">Adjust audio frequencies</p>
                </div>
                <button onClick={onOpenEq} className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700">
                    <Sliders className="w-5 h-5" />
                </button>
            </div>
            <div className="flex items-center justify-between">
                <div>
                    <p className="font-medium">Video Autoplay</p>
                    <p className="text-sm text-zinc-500">Automatically switch to video mode</p>
                </div>
                <button onClick={onToggleVideoAutoplay} className={`w-12 h-7 rounded-full transition-colors relative ${videoAutoplay ? 'bg-green-500' : 'bg-zinc-700'}`}>
                    <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${videoAutoplay ? 'translate-x-5' : ''}`} />
                </button>
            </div>
        </div>

        <div className="bg-zinc-900/50 rounded-2xl p-6 space-y-6">
            <h3 className="text-xl font-bold border-b border-white/5 pb-4">Lyrics</h3>
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium">Timing Calibration</p>
                        <p className="text-sm text-zinc-500">Adjust sync offset (seconds)</p>
                    </div>
                    <span className="font-mono text-[#fa2d48] font-bold">{lyricsOffset > 0 ? '+' : ''}{lyricsOffset.toFixed(2)}s</span>
                </div>
                <input 
                    type="range" 
                    min="-2" 
                    max="2" 
                    step="0.05" 
                    value={lyricsOffset} 
                    onChange={(e) => onSetLyricsOffset(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-[#fa2d48]"
                />
            </div>
        </div>
        
        <div className="bg-zinc-900/50 rounded-2xl p-6 space-y-6">
            <h3 className="text-xl font-bold border-b border-white/5 pb-4">Visualizer</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {['normal', 'glow', 'bars', 'retro', 'pixel', 'lcd', 'wave', 'spectrum', 'dna', 'orb', 'matrix', 'grid', 'vinyl', 'starfield', 'custom', 'none'].map((style) => (
                    <button 
                        key={style}
                        onClick={() => onSetVisualizerStyle(style as VisualizerStyle)}
                        className={`p-3 rounded-xl border font-medium text-sm capitalize ${visualizerStyle === style ? 'bg-[#fa2d48] border-[#fa2d48] text-white' : 'bg-zinc-800 border-transparent text-zinc-400 hover:bg-zinc-700'}`}
                    >
                        {style}
                    </button>
                ))}
            </div>
        </div>
    </div>
    );
}

function SidebarItem({ icon: Icon, label, active, onClick, key }: { icon: any, label: string, active?: boolean, onClick: () => void, key?: React.Key }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-4 px-2 py-2 rounded-lg transition-colors group ${active ? 'bg-[#fa2d48]/10 text-[#fa2d48]' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
      <Icon className={`w-5 h-5 ${active ? 'text-[#fa2d48]' : 'text-zinc-400 group-hover:text-white'}`} />
      <span className="font-bold text-sm">{label}</span>
    </button>
  );
}

function BottomNavItem({ icon: Icon, label, active, onClick, key }: { icon: any, label: string, active?: boolean, onClick: () => void, key?: React.Key }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1">
      <Icon className={`w-6 h-6 ${active ? 'text-[#fa2d48]' : 'text-zinc-500'}`} />
      <span className={`text-[10px] font-medium ${active ? 'text-[#fa2d48]' : 'text-zinc-500'}`}>{label}</span>
    </button>
  );
}

function TrackItem({ track, isAnimatedCoversEnabled, cleanTitle, cleanArtist, onPlay, onEditVideo, onEditInfo, onAddToPlaylist, isActive, orderIndex, onPreview, isSelected }: any) {
    return (
        <div className={`group relative flex flex-col gap-3 cursor-pointer p-2 rounded-2xl transition-all ${isSelected ? 'bg-blue-600/10' : ''}`} onClick={onPlay}>
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-zinc-900 border border-white/5 shadow-lg group-hover:shadow-2xl transition-all duration-300">
                 <img src={(isAnimatedCoversEnabled && track.animatedCoverUrl) ? track.animatedCoverUrl : (track.coverUrl || DEFAULT_COVER)} className={`w-full h-full object-cover transition-transform duration-500 ${isActive ? 'scale-105' : 'group-hover:scale-110'}`} loading="lazy" />
                 <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {isActive ? <div className="w-8 h-8 flex items-start justify-center gap-1"><span className="w-1 h-full bg-[#fa2d48] animate-[music-bar_0.5s_ease-in-out_infinite]" /><span className="w-1 h-full bg-[#fa2d48] animate-[music-bar_0.5s_ease-in-out_0.1s_infinite]" /><span className="w-1 h-full bg-[#fa2d48] animate-[music-bar_0.5s_ease-in-out_0.2s_infinite]" /></div> : <Play className="w-12 h-12 fill-white text-white drop-shadow-lg" />}
                 </div>
                 {isSelected && (
                     <div className="absolute top-2 left-2 w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center shadow-lg border-2 border-white animate-in zoom-in duration-200">
                         <CheckCircle2 className="w-5 h-5 text-white" />
                     </div>
                 )}
                 {orderIndex && !isSelected && <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-xs font-bold backdrop-blur-md">{orderIndex}</div>}
                 <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); onAddToPlaylist(); }} className="p-2 bg-black/60 rounded-full hover:bg-black/80 backdrop-blur-md"><Plus className="w-4 h-4 text-white" /></button>
                    {onEditInfo && <button onClick={(e) => { e.stopPropagation(); onEditInfo(); }} className="p-2 bg-black/60 rounded-full hover:bg-black/80 backdrop-blur-md"><Edit className="w-4 h-4 text-white" /></button>}
                    {onEditVideo && <button onClick={(e) => { e.stopPropagation(); onEditVideo(); }} className="p-2 bg-black/60 rounded-full hover:bg-black/80 backdrop-blur-md"><Tv className="w-4 h-4 text-white" /></button>}
                    {onPreview && <button onClick={(e) => { e.stopPropagation(); onPreview(); }} className="p-2 bg-black/60 rounded-full hover:bg-black/80 backdrop-blur-md"><Maximize2 className="w-4 h-4 text-white" /></button>}
                 </div>
            </div>
            <div className="flex flex-col min-w-0 px-1">
                <span className={`font-bold text-[15px] truncate leading-tight ${isActive ? 'text-[#fa2d48]' : 'text-zinc-100'}`}>{cleanTitle(track.title)}</span>
                <span className="text-[13px] text-zinc-500 truncate font-medium">{cleanArtist(track.artist)}</span>
            </div>
        </div>
    );
}

function DashboardView({ tracks, playlists, artists, albums, isAnimatedCoversEnabled, onPlayTrack, onPlaylistClick, onArtistClick, onAlbumClick, cleanTitle, cleanArtist, onPreview, isSelectionMode, selectedIds }: any) {
    const recent = tracks.slice(0, 10);
    const featured = tracks.filter((t: Track) => t.coverUrl && t.coverUrl !== DEFAULT_COVER).sort(() => Math.random() - 0.5).slice(0, 5);
    return (
        <div className="space-y-12">
            {!isSelectionMode && (
                <section>
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">Made for You <ChevronRight className="w-5 h-5 text-zinc-600" /></h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="h-64 rounded-3xl bg-gradient-to-br from-red-600 to-orange-600 p-8 flex flex-col justify-between relative overflow-hidden group cursor-pointer shadow-2xl" onClick={() => onPlayTrack(featured[0])}>
                            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
                            <div><p className="font-bold text-white/80 uppercase tracking-widest text-xs mb-1">Station</p><h3 className="text-3xl font-black text-white w-2/3 leading-tight">New Music Mix</h3></div>
                            <Play className="w-12 h-12 fill-white text-white opacity-0 group-hover:opacity-100 transition-all translate-y-4 group-hover:translate-y-0" />
                        </div>
                        {featured.slice(1, 3).map((t: Track) => (
                            <div key={t.id} className="h-64 rounded-3xl bg-zinc-900 border border-white/5 relative overflow-hidden group cursor-pointer" onClick={() => onPlayTrack(t)}>
                                <img src={(isAnimatedCoversEnabled && t.animatedCoverUrl) ? t.animatedCoverUrl : (t.coverUrl || DEFAULT_COVER)} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent p-6 flex flex-col justify-end">
                                    <p className="font-bold text-[#fa2d48] text-xs uppercase tracking-widest mb-1">Featured Track</p>
                                    <h3 className="text-xl font-bold text-white truncate">{cleanTitle(t.title)}</h3>
                                    <p className="text-white/60 truncate">{cleanArtist(t.artist)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
            <section>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold">Recently Added</h2>
                    <button className="text-[#fa2d48] text-sm font-bold">See All</button>
                </div>
                <div className="flex overflow-x-auto gap-6 pb-4 -mx-8 px-8 no-scrollbar snap-x">
                    {recent.map((t: Track) => (
                        <div key={t.id} className="w-40 flex-shrink-0 snap-start">
                            <TrackItem track={t} isAnimatedCoversEnabled={isAnimatedCoversEnabled} cleanTitle={cleanTitle} cleanArtist={cleanArtist} onPlay={() => onPlayTrack(t)} onPreview={() => onPreview(t)} isSelected={selectedIds.includes(t.id)} />
                        </div>
                    ))}
                </div>
            </section>
             <section>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold">Top Albums</h2>
                </div>
                 <div className="flex overflow-x-auto gap-6 pb-4 -mx-8 px-8 no-scrollbar snap-x">
                    {albums.slice(0, 10).map((a: any) => (
                        <div key={a.name} onClick={() => onAlbumClick(a.name)} className="w-44 flex-shrink-0 snap-start">
                             <div className="aspect-square rounded-2xl overflow-hidden bg-zinc-900 border border-white/5 shadow-xl relative">
                                 <img src={(isAnimatedCoversEnabled && a.animatedCover) ? a.animatedCover : (a.cover || DEFAULT_COVER)} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                             </div>
                             <div>
                                 <p className="font-bold truncate text-[15px] group-hover:text-[#fa2d48] transition-colors">{a.name}</p>
                                 <p className="text-sm text-zinc-500 truncate">{a.artist}</p>
                             </div>
                        </div>
                    ))}
                 </div>
            </section>
        </div>
    );
}

function PasswordModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
    const [password, setPassword] = useState("");
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (password === "admin123" || password === "password") onSuccess();
        else alert("Incorrect password");
    };
    return (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-zinc-900 border border-white/10 rounded-3xl p-8 w-full max-sm shadow-2xl relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-white active-scale"><X className="w-5 h-5" /></button>
                <h2 className="text-2xl font-black mb-2 tracking-tight">Developer Access</h2>
                <p className="text-zinc-400 mb-6 text-sm">Enter password to enable advanced features.</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input autoFocus type="password" placeholder="Password" className="w-full bg-black/50 border border-white/10 rounded-xl py-4 px-4 outline-none focus:ring-2 focus:ring-[#fa2d48]" value={password} onChange={e => setPassword(e.target.value)} />
                    <button type="submit" className="w-full bg-[#fa2d48] text-white font-bold py-4 rounded-xl hover:bg-red-600 transition-colors shadow-lg active-scale">Unlock</button>
                </form>
            </div>
        </div>
    );
}

function SongPreviewModal({ track, onClose }: { track: Track, onClose: () => void }) {
    const audioRef = useRef<HTMLAudioElement>(null);
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = 0.5;
            audioRef.current.play().catch(() => {});
        }
    }, []);
    return (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in" onClick={onClose}>
            <div className="bg-zinc-900 border border-white/10 w-full max-w-lg rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center space-y-6 animate-in zoom-in" onClick={e => e.stopPropagation()}>
                <img src={track.animatedCoverUrl || track.coverUrl} className="w-64 h-64 rounded-2xl shadow-2xl object-cover" />
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold">{track.title}</h2>
                    <p className="text-xl text-zinc-400">{track.artist}</p>
                    <p className="text-zinc-600 text-sm">{track.album}</p>
                </div>
                <audio ref={audioRef} src={track.url} controls className="w-full" />
                <button onClick={onClose} className="text-zinc-500 hover:text-white font-medium">Close Preview</button>
            </div>
        </div>
    );
}

function PlaylistModal({ playlists, onAdd, onClose }: { playlists: Playlist[], onAdd: (id: string) => void, onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-zinc-900 border border-white/10 w-full max-w-sm rounded-3xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-xl">Add to Playlist</h3>
                    <button onClick={onClose} className="active-scale"><X className="w-5 h-5 text-zinc-500" /></button>
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                    {playlists.length === 0 && <p className="text-zinc-500 text-center py-4">No playlists found.</p>}
                    {playlists.map(p => (
                        <button key={p.id} onClick={() => { onAdd(p.id); onClose(); }} className="w-full flex items-center gap-4 p-3 hover:bg-white/5 rounded-xl transition-colors active-scale">
                            <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center"><Music className="w-5 h-5 text-zinc-500" /></div>
                            <span className="font-medium">{p.name}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

function CreatePlaylistModal({ onSubmit, onClose }: { onSubmit: (name: string) => void, onClose: () => void }) {
    const [name, setName] = useState("");
    return (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-zinc-900 border border-white/10 w-full max-w-sm rounded-3xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                <h3 className="font-bold text-xl mb-4">New Playlist</h3>
                <input autoFocus type="text" placeholder="Playlist Name" className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 mb-4 outline-none focus:ring-2 focus:ring-[#fa2d48]" value={name} onChange={e => setName(e.target.value)} />
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl hover:bg-white/5 text-zinc-400 font-medium active-scale">Cancel</button>
                    <button onClick={() => { if(name.trim()) onSubmit(name); }} className="flex-1 py-3 bg-[#fa2d48] rounded-xl text-white font-bold active-scale">Create</button>
                </div>
            </div>
        </div>
    );
}

function VideoLinkModal({ track, onClose, onSave }: { track: Track, onClose: () => void, onSave: (id: string, url: string) => void }) {
    const [url, setUrl] = useState(track.videoUrl || "");
    return (
        <div className="fixed inset-0 z-[250] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
             <div className="bg-zinc-900 border border-white/10 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-xl">Edit Video Link</h3>
                    <button onClick={onClose} className="active-scale"><X className="w-5 h-5" /></button>
                </div>
                <p className="text-zinc-500 text-sm">Attach a background video or music video URL (MP4/WebM) to <b>{track.title}</b>.</p>
                <input autoFocus type="text" placeholder="https://..." className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 outline-none focus:ring-2 focus:ring-[#fa2d48]" value={url} onChange={e => setUrl(e.target.value)} />
                <button onClick={() => onSave(track.id, url)} className="w-full py-3 bg-[#fa2d48] rounded-xl text-white font-bold active-scale">Save Link</button>
             </div>
        </div>
    );
}

function RouletteView({ tracks, isAnimatedCoversEnabled, onPlay }: { tracks: Track[], isAnimatedCoversEnabled: boolean, onPlay: (t: Track) => void }) {
    const [spinning, setSpinning] = useState(false);
    const [selected, setSelected] = useState<Track | null>(null);
    const spin = () => {
        if (spinning || tracks.length === 0) return;
        setSpinning(true);
        setSelected(null);
        let duration = 3000;
        let interval = 50;
        let elapsed = 0;
        const timer = setInterval(() => {
            elapsed += interval;
            const random = tracks[Math.floor(Math.random() * tracks.length)];
            setSelected(random);
            if (elapsed >= duration) {
                clearInterval(timer);
                setSpinning(false);
                setTimeout(() => onPlay(random), 500);
            } else interval *= 1.1;
        }, interval);
    };
    return (
        <div className="flex flex-col items-center justify-center h-full pb-20 space-y-12">
            <div className={`relative w-64 h-64 rounded-full border-4 border-[#fa2d48] flex items-center justify-center shadow-[0_0_50px_rgba(250,45,72,0.3)] bg-zinc-900 overflow-hidden ${spinning ? 'animate-pulse' : ''}`}>
                 {selected ? <img src={(isAnimatedCoversEnabled && selected.animatedCoverUrl) ? selected.animatedCoverUrl : (selected.coverUrl || DEFAULT_COVER)} className="w-full h-full object-cover" /> : <Dices className="w-24 h-24 text-zinc-700" />}
            </div>
            <div className="text-center space-y-2 h-20">
                {selected && (<><h2 className="text-2xl font-bold">{selected.title}</h2><p className="text-zinc-400">{selected.artist}</p></>)}
            </div>
            <button onClick={spin} disabled={spinning} className="px-12 py-4 bg-[#fa2d48] text-white text-xl font-bold rounded-full shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale">
                {spinning ? "Spinning..." : "SPIN THE WHEEL"}
            </button>
        </div>
    );
}

function GamesView({ tracks, onPlayFlappy, onPlayRhythm, onBack }: any) {
    return (
        <div className="max-w-4xl mx-auto p-4 space-y-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="text-center space-y-4 mb-12"><h2 className="text-4xl font-black italic tracking-tighter uppercase">Arcade Zone</h2><p className="text-zinc-400 text-lg font-medium opacity-80">Play rhythm-based mini-games with your library.</p></div>
            <div className="grid md:grid-cols-2 gap-8">
                <div onClick={onPlayFlappy} className="group relative h-80 bg-zinc-900 rounded-[40px] border border-white/10 overflow-hidden cursor-pointer active:scale-95 transition-all shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/20 to-orange-600/20" />
                    <img src="https://images.unsplash.com/photo-1551103782-8ab07afd45c1?auto=format&fit=crop&q=80" className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:scale-110 transition-transform duration-700" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10">
                        <Gamepad2 className="w-20 h-20 text-yellow-400 mb-4 drop-shadow-lg" />
                        <h3 className="text-3xl font-black text-white italic uppercase drop-shadow-lg tracking-tight">Flappy Song</h3>
                        <p className="text-white/80 font-medium mt-2 max-w-[240px]">Jump through pipes that sync with the rhythm.</p>
                    </div>
                </div>
                <div onClick={() => onPlayRhythm(tracks[Math.floor(Math.random()*tracks.length)])} className="group relative h-80 bg-zinc-900 rounded-[40px] border border-white/10 overflow-hidden cursor-pointer active:scale-95 transition-all shadow-2xl">
                     <div className="absolute inset-0 bg-gradient-to-br from-blue-400/20 to-purple-600/20" />
                     <img src="https://images.unsplash.com/photo-1514525253440-b393452e8d26?auto=format&fit=crop&q=80" className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:scale-110 transition-transform duration-700" />
                     <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10">
                        <Music2 className="w-20 h-20 text-purple-400 mb-4 drop-shadow-lg" />
                        <h3 className="text-3xl font-black text-white italic uppercase drop-shadow-lg tracking-tight">Neon Rhythm</h3>
                        <p className="text-white/80 font-medium mt-2 max-w-[240px]">Test your speed on this 4-lane rhythm challenge.</p>
                    </div>
                </div>
            </div>
            <div className="text-center pt-10"><button onClick={onBack} className="text-zinc-600 hover:text-white font-black tracking-widest text-xs uppercase transition-colors">Exit Arcade</button></div>
        </div>
    );
}

function BatchUploadModal({ albums, tracks, onClose, onSaveLyric }: { albums: any[], tracks: Track[], onClose: () => void, onSaveLyric: (id: string, text: string) => Promise<void> }) {
    const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
    const [files, setFiles] = useState<FileList | null>(null);
    const [status, setStatus] = useState("");
    const handleBatchUpload = async () => {
        if (!selectedAlbum || !files) return;
        const albumTracks = tracks.filter(t => (t.album || "Unknown Album") === selectedAlbum);
        setStatus("Processing...");
        let matched = 0;
        for (let i = 0; i < files.length; i++) {
             const file = files[i];
             const text = await file.text();
             const cleanName = file.name.toLowerCase().replace('.lrc', '').replace('.txt', '').replace(/^\d+\s*-\s*/, '');
             const match = albumTracks.find(t => t.title.toLowerCase().includes(cleanName) || t.filename.toLowerCase().includes(cleanName));
             if (match) { await onSaveLyric(match.id, text); matched++; }
        }
        setStatus(`Uploaded lyrics for ${matched} tracks.`);
        setTimeout(onClose, 2000);
    };
    return (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-white/10 w-full max-w-lg rounded-3xl p-8 shadow-2xl space-y-6 relative">
                 <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 active-scale"><X className="w-5 h-5" /></button>
                 <h2 className="text-2xl font-black tracking-tight">Batch Lyrics Upload</h2>
                 <div className="space-y-4">
                     <div>
                         <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3 px-1">Select Album</label>
                         <select className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-[#fa2d48]" onChange={e => setSelectedAlbum(e.target.value)} value={selectedAlbum || ""}>
                             <option value="">-- Choose Album --</option>
                             {albums.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                         </select>
                     </div>
                     <div>
                         <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3 px-1">Lyric Files (.lrc/.txt)</label>
                         <input type="file" multiple accept=".lrc,.txt" className="w-full bg-black/50 p-4 rounded-xl border border-white/10 text-sm" onChange={e => setFiles(e.target.files)} />
                     </div>
                     {status && <p className="text-[#fa2d48] font-bold text-center animate-in fade-in">{status}</p>}
                     <button onClick={handleBatchUpload} disabled={!selectedAlbum || !files} className="w-full bg-[#fa2d48] py-4 rounded-xl font-black text-white disabled:opacity-30 active-scale shadow-lg">Start Upload</button>
                 </div>
            </div>
        </div>
    );
}

function LyricsView({ lyrics, currentTime, onSeek, offset }: { lyrics: string, currentTime: number, onSeek: (t: number) => void, offset: number }) {
    const lines = useMemo(() => parseLyrics(lyrics), [lyrics]);
    const activeIndex = useMemo(() => {
        const t = currentTime + (offset || 0);
        return lines.findIndex((line, i) => {
            const next = lines[i + 1];
            return t >= line.time && (!next || t < next.time);
        });
    }, [lines, currentTime, offset]);
    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (activeIndex !== -1 && containerRef.current) {
            const el = containerRef.current.children[activeIndex] as HTMLElement;
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [activeIndex]);
    if (lines.length === 0) return (<div className="h-full flex items-center justify-center p-8 text-center text-zinc-500 font-medium overflow-y-auto no-scrollbar"><p className="whitespace-pre-line leading-[2.5] text-2xl md:text-3xl font-bold max-w-lg">{lyrics || "No synced lyrics available."}</p></div>);
    return (
        <div ref={containerRef} className="h-full overflow-y-auto px-4 py-[50vh] no-scrollbar text-center space-y-10 md:space-y-12 mask-linear">
             {lines.map((line, i) => (<p key={i} onClick={() => onSeek(line.time)} className={`text-3xl md:text-5xl font-black transition-all duration-700 cursor-pointer origin-center leading-tight tracking-tight ${i === activeIndex ? 'text-white scale-110 drop-shadow-[0_0_30px_rgba(255,255,255,0.4)]' : 'text-zinc-700/40 hover:text-zinc-500 hover:blur-0 blur-[2px]'}`}>{line.text}</p>))}
        </div>
    );
}

function FullPlayerUI({ 
    track, isPlaying, isBuffering, isHudVisible, currentTime, duration, volume, mode, isShuffle, repeatMode, analyserNode, visualizerStyle, isAnimatedCoversEnabled, customVizConfig,
    onClose, onTogglePlay, onSeek, onPrev, onNext, onSetVolume, onSetShuffle, onSetRepeat, onOpenEq, onSetMode, registerVideo, unregisterVideo, cleanTitle, cleanArtist, formatTime, onUploadLyrics, onEditInfo, lyricsOffset, onTogglePiP, isPipActive
}: any) {
    const [showLyrics, setShowLyrics] = useState(false);
    return (
        <div className="fixed inset-0 z-[100] bg-[#1c1c1e] text-white flex flex-col overflow-hidden h-full w-full">
            <div className="absolute inset-0 z-0">
                {mode === 'video' && track.videoUrl ? (
                    <ImmersiveVideoPlayer track={track} isPlaying={isPlaying} isActive={true} registerVideo={registerVideo} unregisterVideo={unregisterVideo} currentTime={currentTime} className="w-full h-full object-cover" />
                ) : (
                    <>
                        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 to-black" />
                        <Visualizer analyser={analyserNode} coverUrl={track.coverUrl} className="absolute inset-0 opacity-60" style={visualizerStyle} customConfig={customVizConfig} />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#1c1c1e] via-transparent to-transparent" />
                    </>
                )}
            </div>
            
            <div className={`relative z-10 flex items-center justify-between px-6 pt-12 pb-4 transition-opacity duration-300 ${isHudVisible ? 'opacity-100' : 'opacity-0'}`}>
                 <button onClick={onClose} className="p-2 bg-white/10 rounded-full backdrop-blur-md hover:bg-white/20 active-scale"><ChevronDown className="w-6 h-6" /></button>
                 <div className="flex gap-2">
                    <button onClick={() => onTogglePiP(document.querySelector('canvas'))} className={`p-2 rounded-full backdrop-blur-md hover:bg-white/20 transition-all active-scale ${isPipActive ? 'bg-white text-black' : 'bg-white/10 text-white'}`} title="PiP Mode">
                        <ExternalLink className="w-5 h-5" />
                    </button>
                    <button onClick={() => onSetMode(mode === 'audio' ? 'video' : 'audio')} disabled={!track.videoUrl} className={`p-2 rounded-full backdrop-blur-md hover:bg-white/20 transition-all active-scale ${mode === 'video' ? 'bg-white text-black' : 'bg-white/10 text-white disabled:opacity-30'}`}>
                        <Tv className="w-5 h-5" />
                    </button>
                    <button onClick={() => setShowLyrics(!showLyrics)} className={`p-2 rounded-full backdrop-blur-md hover:bg-white/20 transition-all active-scale ${showLyrics ? 'bg-white text-black' : 'bg-white/10 text-white'}`}>
                        <MessageSquareQuote className="w-5 h-5" />
                    </button>
                    <button onClick={onOpenEq} className="p-2 bg-white/10 rounded-full backdrop-blur-md hover:bg-white/20 active-scale"><Sliders className="w-5 h-5" /></button>
                 </div>
            </div>

            <div className={`relative z-10 flex-1 flex flex-col min-h-0 ${showLyrics ? 'lg:flex-row' : ''} gap-4 md:gap-8 px-6 md:px-12 lg:px-20 pb-12 transition-all duration-500 items-center justify-center w-full`}>
                <div className={`flex flex-col items-center justify-center transition-all duration-500 shrink-0 ${showLyrics ? 'lg:w-[45%] h-auto lg:h-full order-2 lg:order-1' : 'w-full h-full max-w-4xl'}`}>
                    {mode === 'audio' && (
                        <div className={`aspect-square rounded-2xl shadow-2xl overflow-hidden border border-white/10 bg-zinc-900 relative transition-all duration-500 flex-none min-h-0 ${showLyrics ? 'hidden lg:block w-[min(35vh,300px)] mb-8' : 'w-[min(80vw,42vh)] mb-8 lg:mb-12 shadow-[0_30px_60px_rgba(0,0,0,0.5)]'}`}>
                            <img src={(isAnimatedCoversEnabled && track.animatedCoverUrl) ? track.animatedCoverUrl : (track.coverUrl || DEFAULT_COVER)} className="w-full h-full object-cover rounded-2xl" />
                        </div>
                    )}
                    
                    <div className={`w-full max-w-lg rounded-3xl p-6 md:p-8 transition-all duration-500 flex flex-col ${isHudVisible ? 'bg-black/40 backdrop-blur-2xl border border-white/5 shadow-2xl' : 'bg-transparent border-transparent shadow-none'}`}>
                        <div className="flex justify-between items-center mb-6">
                            <div className="overflow-hidden pr-4">
                                <h2 className="text-2xl md:text-3xl font-bold truncate text-white leading-tight tracking-tight">{cleanTitle(track.title)}</h2>
                                <p className="text-lg md:text-xl text-zinc-400 truncate font-medium mt-1">{cleanArtist(track.artist)}</p>
                            </div>
                            <div className={`flex gap-1 transition-opacity duration-300 ${isHudVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                {onEditInfo && <button onClick={onEditInfo} className="p-2 rounded-full hover:bg-white/10 active-scale"><Edit className="w-6 h-6 text-white" /></button>}
                                <button className="p-2 rounded-full hover:bg-white/10 active-scale"><MoreHorizontal className="w-6 h-6 text-white" /></button>
                            </div>
                        </div>

                        <div className={`transition-opacity duration-500 ${isHudVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                            <div className="mb-6 group">
                                <input type="range" min="0" max={duration || 100} value={currentTime} onChange={(e) => onSeek(Number(e.target.value))} className="w-full h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer accent-white hover:h-2 transition-all" />
                                <div className="flex justify-between text-xs text-zinc-500 font-bold mt-3 tabular-nums">
                                    <span>{formatTime(currentTime)}</span>
                                    <span>-{formatTime(duration - currentTime)}</span>
                                </div>
                            </div>

                            <div className="flex items-center justify-between mb-8">
                                <button onClick={onSetShuffle} className={`p-2 rounded-full hover:bg-white/10 transition-colors active-scale ${isShuffle ? 'text-[#fa2d48]' : 'text-zinc-500'}`}><Shuffle className="w-6 h-6" /></button>
                                <div className="flex items-center gap-6 md:gap-10">
                                    <button onClick={onPrev} className="text-white hover:text-zinc-300 transition-transform active-scale-95"><SkipBack className="w-10 h-10 fill-current" /></button>
                                    <button onClick={onTogglePlay} className="w-20 h-20 md:w-24 md:h-24 flex items-center justify-center bg-white rounded-full text-black hover:scale-105 transition-all shadow-xl shadow-white/10 active:scale-90">
                                        {isBuffering ? <Loader2 className="w-8 h-8 animate-spin" /> : isPlaying ? <Pause className="w-12 h-12 fill-current" /> : <Play className="w-12 h-12 fill-current ml-1" />}
                                    </button>
                                    <button onClick={onNext} className="text-white hover:text-zinc-300 transition-transform active-scale-95"><SkipForward className="w-10 h-10 fill-current" /></button>
                                </div>
                                <button onClick={onSetRepeat} className={`p-2 rounded-full hover:bg-white/10 transition-colors active-scale ${repeatMode !== 'none' ? 'text-[#fa2d48]' : 'text-zinc-500'}`}>
                                    {repeatMode === 'one' ? <div className="relative"><Repeat className="w-6 h-6" /><span className="absolute -top-1 -right-1 text-[8px] font-black">1</span></div> : <Repeat className="w-6 h-6" />}
                                </button>
                            </div>

                            <div className="flex items-center gap-4">
                                <Volume2 className="w-5 h-5 text-zinc-500" />
                                <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => onSetVolume(Number(e.target.value))} className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-zinc-500" />
                            </div>
                        </div>
                    </div>
                </div>

                {showLyrics && (
                    <div className="flex-1 w-full h-full min-h-0 animate-in fade-in slide-in-from-right duration-500 lg:pl-8 order-1 lg:order-2 overflow-hidden rounded-[40px] bg-black/20 backdrop-blur-3xl border border-white/5">
                        {track.lyrics ? (
                            <LyricsView lyrics={track.lyrics} currentTime={currentTime} onSeek={onSeek} offset={lyricsOffset} />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-12 gap-6">
                                <div className="p-6 bg-white/5 rounded-full"><MessageSquareQuote className="w-12 h-12 text-zinc-600" /></div>
                                <div className="space-y-2">
                                    <h3 className="text-2xl font-bold text-white">No Lyrics Available</h3>
                                    <p className="text-zinc-500 max-w-xs mx-auto">Upload a timed .lrc file in settings to see lyrics here.</p>
                                </div>
                                {onUploadLyrics && (
                                    <button onClick={onUploadLyrics} className="bg-white text-black px-8 py-3 rounded-full font-black text-sm active-scale shadow-lg">Upload Lyrics</button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// Added missing YoutubeDownloadModal component
function YoutubeDownloadModal({ onClose, onImport }: { onClose: () => void, onImport: (url: string, metadata: { album?: string, type: 'single' | 'album' }) => void }) {
    const [url, setUrl] = useState("");
    const [type, setType] = useState<'single' | 'album'>('single');
    const [album, setAlbum] = useState("");
    return (
        <div className="fixed inset-0 z-[250] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in">
            <div className="bg-zinc-900 border border-white/10 w-full max-w-md rounded-3xl p-8 shadow-2xl space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-black">YouTube Import</h2>
                    <button onClick={onClose}><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-4">
                    <input autoFocus type="text" placeholder="YouTube URL" className="w-full bg-black/50 border border-white/10 rounded-xl py-4 px-4 outline-none focus:ring-2 focus:ring-red-600" value={url} onChange={e => setUrl(e.target.value)} />
                    <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                        <button onClick={() => setType('single')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${type === 'single' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>Single</button>
                        <button onClick={() => setType('album')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${type === 'album' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>Album</button>
                    </div>
                    {type === 'album' && (
                        <input type="text" placeholder="Album Name" className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 outline-none focus:ring-2 focus:ring-[#fa2d48]" value={album} onChange={e => setAlbum(e.target.value)} />
                    )}
                </div>
                <button disabled={!url} onClick={() => onImport(url, { type, album })} className="w-full py-4 bg-red-600 text-white rounded-xl font-black shadow-lg shadow-red-600/20 active-scale disabled:opacity-30">Import Audio</button>
            </div>
        </div>
    );
}

// Added missing AnimatedCoverModal component
function AnimatedCoverModal({ albums, tracks, onClose, onSaved }: { albums: any[], tracks: Track[], onClose: () => void, onSaved: () => void }) {
    const [selectedTarget, setSelectedTarget] = useState<string>(""); // album:name or track:id
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedTarget) return;
        setIsSaving(true);
        const success = await uploadTrackWithProgress(file, () => {});
        if (success) {
            await saveAnimatedCoverMapping(selectedTarget, file.name);
            onSaved();
            onClose();
        } else {
            alert("Upload failed");
        }
        setIsSaving(false);
    };

    return (
        <div className="fixed inset-0 z-[250] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in">
            <div className="bg-zinc-900 border border-white/10 w-full max-w-lg rounded-3xl p-8 shadow-2xl space-y-6">
                <input type="file" accept=".gif" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-black">Manage Animated Covers</h2>
                    <button onClick={onClose}><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-4">
                    <select className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-[#fa2d48]" onChange={e => setSelectedTarget(e.target.value)} value={selectedTarget}>
                        <option value="">-- Select Target --</option>
                        <optgroup label="Albums">
                            {albums.map(a => <option key={`album:${a.name}`} value={`album:${a.artist}|${a.name}`}>Album: {a.name}</option>)}
                        </optgroup>
                        <optgroup label="Tracks">
                            {tracks.slice(0, 50).map(t => <option key={`track:${t.id}`} value={`track:${t.id}`}>Track: {t.title}</option>)}
                        </optgroup>
                    </select>
                    <button disabled={!selectedTarget || isSaving} onClick={() => fileInputRef.current?.click()} className="w-full py-4 bg-zinc-800 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                        {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ImageIcon className="w-5 h-5" /> Select GIF</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Added missing UploadMetadataModal component
function UploadMetadataModal({ onClose, onProceed }: { onClose: () => void, onProceed: (metadata: { album?: string, type: 'single' | 'album' }) => void }) {
    const [type, setType] = useState<'single' | 'album'>('single');
    const [album, setAlbum] = useState("");
    return (
        <div className="fixed inset-0 z-[250] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in">
            <div className="bg-zinc-900 border border-white/10 w-full max-w-sm rounded-3xl p-8 shadow-2xl space-y-6">
                <h2 className="text-2xl font-black">Upload Details</h2>
                <div className="space-y-4">
                    <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                        <button onClick={() => setType('single')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${type === 'single' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>Single</button>
                        <button onClick={() => setType('album')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${type === 'album' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>Album</button>
                    </div>
                    {type === 'album' && (
                        <input type="text" placeholder="Album Name" className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 outline-none focus:ring-2 focus:ring-[#fa2d48]" value={album} onChange={e => setAlbum(e.target.value)} />
                    )}
                </div>
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 text-zinc-400 font-bold">Cancel</button>
                    <button onClick={() => onProceed({ type, album })} className="flex-1 py-3 bg-[#fa2d48] text-white rounded-xl font-bold">Next</button>
                </div>
            </div>
        </div>
    );
}
