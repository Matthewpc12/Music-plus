import React, { useEffect, useRef, useState } from 'react';
import { Track } from '../types';
import { Loader2 } from 'lucide-react';

interface ImmersiveVideoPlayerProps {
  track: Track;
  registerVideo: (el: HTMLVideoElement) => void;
  unregisterVideo: (el: HTMLVideoElement) => void;
  className?: string;
  isPlaying?: boolean; // Kept for interface compatibility, ignored logic
  isActive?: boolean;  // Kept for interface compatibility, ignored logic
  currentTime?: number; // Kept for interface compatibility, ignored logic
}

export const ImmersiveVideoPlayer: React.FC<ImmersiveVideoPlayerProps> = ({ 
  track, 
  registerVideo, 
  unregisterVideo, 
  className
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Register this video element as the active media source
    registerVideo(video);

    return () => {
        unregisterVideo(video);
    };
  }, [registerVideo, unregisterVideo]);

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
        {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 pointer-events-none">
                <Loader2 className="w-12 h-12 text-white animate-spin drop-shadow-lg" />
            </div>
        )}
        <video 
            ref={videoRef}
            src={track.videoUrl}
            className={`w-full h-full object-cover transition-opacity duration-500 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
            playsInline
            preload="auto"
            crossOrigin="anonymous"
        />
    </div>
  );
};