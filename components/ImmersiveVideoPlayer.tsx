
import React, { useEffect, useRef, useState } from 'react';
import { Track } from '../types';
import { Loader2 } from 'lucide-react';

interface ImmersiveVideoPlayerProps {
  track: Track;
  registerVideo: (el: HTMLVideoElement) => void;
  unregisterVideo: (el: HTMLVideoElement) => void;
  className?: string;
  isPlaying: boolean;
  isActive: boolean;
  currentTime?: number;
}

// Added React namespace by importing React above to fix the type reference error
export const ImmersiveVideoPlayer: React.FC<ImmersiveVideoPlayerProps> = ({ 
  track, 
  registerVideo, 
  unregisterVideo, 
  className,
  isPlaying,
  isActive,
  currentTime = 0
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Registration & Mute Management
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      registerVideo(video);
      video.muted = false;
    } else {
      unregisterVideo(video);
      video.muted = true;
    }

    return () => {
       if (isActive && video) unregisterVideo(video);
    };
  }, [isActive, registerVideo, unregisterVideo]);

  // Sync background video if inactive
  useEffect(() => {
    if (!isActive && videoRef.current && isPlaying) {
        const video = videoRef.current;
        if (Number.isFinite(currentTime) && Math.abs(video.currentTime - currentTime) > 3) {
            video.currentTime = currentTime;
        }
    }
  }, [currentTime, isActive, isPlaying]);

  // Loading State Handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const stopLoading = () => setIsLoading(false);
    const startLoading = () => setIsLoading(true);

    video.addEventListener('waiting', startLoading);
    video.addEventListener('playing', stopLoading);
    video.addEventListener('canplay', stopLoading);
    video.addEventListener('loadstart', startLoading);

    return () => {
        video.removeEventListener('waiting', startLoading);
        video.removeEventListener('playing', stopLoading);
        video.removeEventListener('canplay', stopLoading);
        video.removeEventListener('loadstart', startLoading);
    };
  }, []);

  if (!track.videoUrl) return null;

  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
        {isLoading && isActive && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 pointer-events-none">
                <Loader2 className="w-12 h-12 text-white animate-spin drop-shadow-lg" />
            </div>
        )}
        <video 
            ref={videoRef}
            src={track.videoUrl}
            className={`w-full h-full transition-opacity duration-1000 ${isLoading ? 'opacity-0' : 'opacity-100'} ${isActive ? 'object-cover' : 'object-contain'}`}
            playsInline
            muted={!isActive} 
            preload="auto"
            crossOrigin="anonymous"
        />
    </div>
  );
};
