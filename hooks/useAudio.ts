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

  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const nextTrackRef = useRef<() => void>(null);
  const prevTrackRef = useRef<() => void>(null);

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

  const togglePlayPause = useCallback(() => {
    initAudioNodes();
    if (mainAudio.paused) {
      mainAudio.play();
      heartbeatAudio.play().catch(() => {});
      setIsPlaying(true);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    } else {
      mainAudio.pause();
      setIsPlaying(false);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    }
  }, [initAudioNodes]);

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
    }
  }, [togglePlayPause]);

  const playTrack = useCallback((track: Track, forceVideoMode = false) => {
    initAudioNodes();
    heartbeatAudio.play().catch(() => {});

    if (currentTrack?.id !== track.id) {
      setCurrentTrack(track);
      mainAudio.src = track.url;
      mainAudio.load();
    }

    if (forceVideoMode && track.videoUrl) {
      setMode('video');
    }

    const playPromise = mainAudio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        setIsPlaying(true);
        setIsEnded(false);
        updateMediaSession(track);
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
      }).catch(e => {
        console.error("Playback failed:", e);
        setIsPlaying(false);
      });
    }
  }, [currentTrack, initAudioNodes, updateMediaSession]);

  const seek = useCallback((time: number) => {
    mainAudio.currentTime = time;
  }, []);

  const setTrackMetadata = useCallback((track: Track) => {
    setCurrentTrack(track);
    updateMediaSession(track);
  }, [updateMediaSession]);

  const setMediaHandlers = useCallback((onNext: () => void, onPrev: () => void) => {
    (nextTrackRef as any).current = onNext;
    (prevTrackRef as any).current = onPrev;
  }, []);

  const requestPiP = useCallback(async (canvasEl?: HTMLCanvasElement | null) => {
    // If PiP is already active, exit it
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return;
    }

    try {
      if (mode === 'video') {
        const video = activeVideoRef.current || document.querySelector('video[src]');
        if (video instanceof HTMLVideoElement && video.requestPictureInPicture) {
          // IMPORTANT: Trigger PiP immediately to maintain user activation
          await video.requestPictureInPicture();
        }
      } else if (mode === 'audio') {
        // Fallback: If no canvas provided, try to find the one with visualizer
        const targetCanvas = canvasEl || document.querySelector('canvas.visualizer-canvas') || document.querySelector('canvas');
        if (targetCanvas) {
          const stream = (targetCanvas as any).captureStream ? (targetCanvas as any).captureStream(30) : null;
          if (stream) {
            const pipVideo = document.createElement('video');
            pipVideo.srcObject = stream;
            pipVideo.muted = true;
            pipVideo.playsInline = true;
            
            // Apply precise requested styles to hide utility video
            pipVideo.style.position = 'absolute';
            pipVideo.style.width = '1px';
            pipVideo.style.height = '1px';
            pipVideo.style.opacity = '0.01';
            pipVideo.style.pointerEvents = 'none';
            pipVideo.style.zIndex = '-1';
            
            document.body.appendChild(pipVideo);
            
            // Critical sequence for browsers to accept PiP request: play THEN request
            pipVideo.play();
            if (pipVideo.requestPictureInPicture) {
              await pipVideo.requestPictureInPicture();
            }

            pipVideo.addEventListener('leavepictureinpicture', () => {
              stream.getTracks().forEach((t: any) => t.stop());
              pipVideo.remove();
            }, { once: true });
          }
        }
      }
    } catch (e) {
      console.error("Picture-in-Picture failed:", e);
    }
  }, [mode]);

  useEffect(() => {
    if (eqBands.bass) eqBands.bass.gain.value = equalizerSettings.bass;
    if (eqBands.mids) eqBands.mids.gain.value = equalizerSettings.mids;
    if (eqBands.treble) eqBands.treble.gain.value = equalizerSettings.treble;
  }, [equalizerSettings]);

  useEffect(() => {
    mainAudio.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (isPlaying && heartbeatAudio.paused) heartbeatAudio.play().catch(() => {});
      } else {
        if (audioContext && audioContext.state === 'suspended') {
          audioContext.resume();
        }
      }
    };

    const onEnterPiP = () => setIsPipActive(true);
    const onLeavePiP = () => setIsPipActive(false);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('enterpictureinpicture', onEnterPiP, true);
    document.addEventListener('leavepictureinpicture', onLeavePiP, true);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('enterpictureinpicture', onEnterPiP, true);
      document.removeEventListener('leavepictureinpicture', onLeavePiP, true);
    };
  }, [isPlaying]);

  useEffect(() => {
    const onTimeUpdate = () => setCurrentTime(mainAudio.currentTime);
    const onLoadedMetadata = () => setDuration(mainAudio.duration);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onEnded = () => {
      setIsPlaying(false);
      setIsEnded(true);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    };

    mainAudio.addEventListener('timeupdate', onTimeUpdate);
    mainAudio.addEventListener('loadedmetadata', onLoadedMetadata);
    mainAudio.addEventListener('waiting', onWaiting);
    mainAudio.addEventListener('playing', onPlaying);
    mainAudio.addEventListener('ended', onEnded);

    return () => {
      mainAudio.removeEventListener('timeupdate', onTimeUpdate);
      mainAudio.removeEventListener('loadedmetadata', onLoadedMetadata);
      mainAudio.removeEventListener('waiting', onWaiting);
      mainAudio.removeEventListener('playing', onPlaying);
      mainAudio.removeEventListener('ended', onEnded);
    };
  }, []);

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
    registerVideo: (el: HTMLVideoElement) => {
      activeVideoRef.current = el;
    },
    unregisterVideo: (el: HTMLVideoElement) => {
      if (activeVideoRef.current === el) {
        activeVideoRef.current = null;
      }
    },
    mode,
    setMode,
    setMediaHandlers,
    setTrackMetadata,
    requestPiP,
    isPipActive
  };
}
