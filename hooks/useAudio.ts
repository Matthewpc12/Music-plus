import { useState, useEffect, useRef, useCallback } from 'react';
import { Track, EqualizerSettings } from '../types';

// Global Persistence
const mainAudio = new Audio();
const heartbeatAudio = new Audio();
const SILENT_MP3 = "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjIzLjEwMgAAAAAAAAAAAAAA//+EAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//+EAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//+EAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

[mainAudio, heartbeatAudio].forEach(el => {
  el.setAttribute('playsinline', 'true');
  el.setAttribute('webkit-playsinline', 'true');
  el.preload = 'auto';
  el.crossOrigin = 'anonymous';
});

heartbeatAudio.src = SILENT_MP3;
heartbeatAudio.loop = true;
heartbeatAudio.volume = 0.01;

let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let source: MediaElementAudioSourceNode | null = null;
let eqBands: { [key: string]: BiquadFilterNode } = {};

export function useAudio() {
  // We use a ref for activeMedia to ensure callbacks like registerVideo are stable and don't cause effect loops
  const activeMediaRef = useRef<HTMLMediaElement>(mainAudio);
  // We use state to trigger re-renders when active media changes
  const [activeMedia, setActiveMediaState] = useState<HTMLMediaElement>(mainAudio);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [mode, setMode] = useState<'audio' | 'video'>('audio');
  const [isPipActive, setIsPipActive] = useState(false);
  const [equalizerSettings, setEqualizerSettings] = useState<EqualizerSettings>({
    bass: 0,
    mids: 0,
    treble: 0,
  });

  const nextTrackRef = useRef<() => void>(null);
  const prevTrackRef = useRef<() => void>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  // Volume refs for stable access in callbacks
  const volumeRef = useRef(volume);
  const isMutedRef = useRef(isMuted);

  useEffect(() => {
      volumeRef.current = volume;
      isMutedRef.current = isMuted;
      activeMediaRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  const initAudioNodes = useCallback(() => {
    if (!audioContext) {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      audioContext = new AudioContextClass();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;

      source = audioContext.createMediaElementSource(mainAudio);

      const bass = audioContext.createBiquadFilter();
      bass.type = 'lowshelf';
      bass.frequency.value = 200;

      const mids = audioContext.createBiquadFilter();
      mids.type = 'peaking';
      mids.frequency.value = 1000;
      mids.Q.value = 1;

      const treble = audioContext.createBiquadFilter();
      treble.type = 'highshelf';
      treble.frequency.value = 3000;

      eqBands = { bass, mids, treble };

      source.connect(bass);
      bass.connect(mids);
      mids.connect(treble);
      treble.connect(analyser);
      analyser.connect(audioContext.destination);
    }
    
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
  }, []);

  // Sync Event Listeners
  useEffect(() => {
    const el = activeMedia;

    const onTimeUpdate = () => setCurrentTime(el.currentTime);
    const onLoadedMetadata = () => setDuration(el.duration || 0);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => { setIsBuffering(false); setIsPlaying(true); };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setIsEnded(true);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    };

    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('loadedmetadata', onLoadedMetadata);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);

    // Initial sync
    setCurrentTime(el.currentTime);
    setDuration(el.duration || 0);
    setIsPlaying(!el.paused);

    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
    };
  }, [activeMedia]);

  const togglePlayPause = useCallback(() => {
    initAudioNodes();
    const media = activeMediaRef.current;
    if (media.paused) {
      media.play().catch(e => console.error("Play failed", e));
      heartbeatAudio.play().catch(() => {});
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    } else {
      media.pause();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    }
  }, [initAudioNodes]);

  const seek = useCallback((time: number) => {
    const media = activeMediaRef.current;
    media.currentTime = time;
    setCurrentTime(time);
  }, []);

  const updateMediaSession = useCallback((track: Track) => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: [
          { src: track.coverUrl || '', sizes: '512x512', type: 'image/jpeg' }
        ]
      });
      
      navigator.mediaSession.setActionHandler('play', togglePlayPause);
      navigator.mediaSession.setActionHandler('pause', togglePlayPause);
      navigator.mediaSession.setActionHandler('previoustrack', () => prevTrackRef.current?.());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextTrackRef.current?.());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined) seek(details.seekTime);
      });
    }
  }, [togglePlayPause, seek]);

  const playTrack = useCallback((track: Track, forceVideoMode = false) => {
    initAudioNodes();
    heartbeatAudio.play().catch(() => {});

    setCurrentTrack(track);
    updateMediaSession(track);

    // Always update mainAudio src for metadata/fallback
    if (mainAudio.src !== track.url) {
        mainAudio.src = track.url;
    }

    if (forceVideoMode && track.videoUrl) {
      setMode('video');
    }

    // Defer play slightly to allow video component to update source if needed
    setTimeout(() => {
        const media = (mode === 'video' && videoRef.current) ? videoRef.current : mainAudio;
        // Ensure volume is set
        media.volume = isMutedRef.current ? 0 : volumeRef.current;
        media.play().catch(e => console.error("Playback failed:", e));
    }, 50);

  }, [initAudioNodes, updateMediaSession, mode]);

  const registerVideo = useCallback((el: HTMLVideoElement) => {
      videoRef.current = el;
      
      // Perform handover if needed
      if (activeMediaRef.current !== el) {
          const oldMedia = activeMediaRef.current;
          const wasPlaying = !oldMedia.paused;
          const time = oldMedia.currentTime;

          oldMedia.pause();

          el.currentTime = time;
          el.volume = isMutedRef.current ? 0 : volumeRef.current;

          activeMediaRef.current = el;
          setActiveMediaState(el);

          if (wasPlaying) {
              el.play().catch(e => console.error("Video handover play failed", e));
          }
      }
  }, []);

  const unregisterVideo = useCallback((el: HTMLVideoElement) => {
      if (videoRef.current === el) videoRef.current = null;
      
      if (activeMediaRef.current === el) {
          // Handover back to mainAudio
          const wasPlaying = !el.paused;
          const time = el.currentTime;
          
          el.pause();
          
          mainAudio.currentTime = time;
          mainAudio.volume = isMutedRef.current ? 0 : volumeRef.current;
          
          activeMediaRef.current = mainAudio;
          setActiveMediaState(mainAudio);
          
          if (wasPlaying) {
              mainAudio.play().catch(e => console.error("Audio handover play failed", e));
          }
      }
  }, []);

  const setMediaHandlers = useCallback((onNext: () => void, onPrev: () => void) => {
    (nextTrackRef as any).current = onNext;
    (prevTrackRef as any).current = onPrev;
  }, []);

  const requestPiP = useCallback(async () => {
    if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
    } else if (activeMediaRef.current instanceof HTMLVideoElement && activeMediaRef.current.readyState >= 1) {
        await activeMediaRef.current.requestPictureInPicture();
    }
  }, []);

  useEffect(() => {
    if (eqBands.bass) eqBands.bass.gain.value = equalizerSettings.bass;
    if (eqBands.mids) eqBands.mids.gain.value = equalizerSettings.mids;
    if (eqBands.treble) eqBands.treble.gain.value = equalizerSettings.treble;
  }, [equalizerSettings]);

  return {
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
    prefetchTrack: (t: Track) => {},
    togglePlayPause,
    analyserNode: analyser,
    equalizerSettings,
    setEqualizerSettings,
    registerVideo,
    unregisterVideo,
    mode,
    setMode,
    setMediaHandlers,
    setTrackMetadata: (t: Track) => { setCurrentTrack(t); updateMediaSession(t); },
    requestPiP,
    isPipActive
  };
}