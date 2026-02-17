
import React, { useEffect, useRef } from 'react';

interface VideoSyncPlayerProps {
  videoUrl: string;
  isPlaying: boolean;
  currentTime: number;
  className?: string;
  muted?: boolean;
  volume?: number;
  objectFit?: 'cover' | 'contain';
}

export const VideoSyncPlayer: React.FC<VideoSyncPlayerProps> = ({ 
  videoUrl, 
  isPlaying, 
  currentTime, 
  className,
  muted = true,
  volume = 1,
  objectFit = 'cover'
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Sync Play/Pause with defensive checks
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      if (video.paused) {
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
              if (e.name !== 'AbortError' && !e.message?.includes('aborted')) {
                  console.warn("Background video sync play failed:", e);
              }
          });
        }
      }
    } else {
      if (!video.paused) {
        video.pause();
      }
    }
  }, [isPlaying]);

  // Sync Mute State
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
        video.muted = muted;
    }
  }, [muted]);

  // Sync Volume State
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
        video.volume = volume;
    }
  }, [volume]);

  // Sync Time (Throttle drift correction)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const drift = Math.abs(video.currentTime - currentTime);
    const tolerance = !muted ? 4.0 : 0.5;

    if (drift > tolerance) {
      video.currentTime = currentTime;
    }
  }, [currentTime, muted]);

  return (
    <div className={`overflow-hidden ${className}`}>
        <video 
            ref={videoRef}
            src={videoUrl}
            className={`w-full h-full object-${objectFit}`}
            playsInline
            muted={muted}
            loop={false} 
        />
    </div>
  );
};
