import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Play, RotateCcw, Trophy } from 'lucide-react';
import { Track } from '../types';

interface FlappySongGameProps {
  tracks: Track[];
  onClose: () => void;
  initialTrack: Track;
}

export const FlappySongGame: React.FC<FlappySongGameProps> = ({ tracks, onClose, initialTrack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [currentGameTrack, setCurrentGameTrack] = useState<Track>(initialTrack);

  // Refs for game state to avoid closure staleness in game loop
  const gameState = useRef({
    birdY: 300,
    birdVelocity: 0,
    pipes: [] as { x: number, gapY: number, passed: boolean }[],
    score: 0,
    isPlaying: false,
    isGameOver: false,
    frameCount: 0
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const birdImgRef = useRef<HTMLImageElement>(new Image());

  // Constants
  const GRAVITY = 0.5;
  const JUMP = -8;
  const PIPE_SPEED = 3;
  const PIPE_SPAWN_RATE = 250; // Increased from 100 for wider horizontal spacing
  const PIPE_GAP = 200; // Increased from 180 for slightly easier vertical gap
  const BIRD_SIZE = 40;
  const PIPE_WIDTH = 60;

  // Initialize Audio, Visualizer and Image
  useEffect(() => {
    // Audio Setup
    audioRef.current = new Audio();
    audioRef.current.crossOrigin = "anonymous";
    audioRef.current.volume = 0.5;

    // Audio Context & Analyser
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioContextRef.current = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64; // Low resolution for retro/simple look
    analyserRef.current = analyser;

    // Connect nodes
    if (audioRef.current) {
        const source = ctx.createMediaElementSource(audioRef.current);
        sourceNodeRef.current = source;
        source.connect(analyser);
        analyser.connect(ctx.destination);
    }
    
    // Set initial track
    playSnippet(initialTrack);

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const playSnippet = (track: Track) => {
    if (!audioRef.current) return;
    
    // Update Image
    if (track.coverUrl) {
        birdImgRef.current.src = track.coverUrl;
    } else {
        birdImgRef.current.src = "https://picsum.photos/50";
    }
    
    setCurrentGameTrack(track);

    // Play Audio
    audioRef.current.src = track.url;
    audioRef.current.currentTime = 30; // 30s Snippet
    
    const playPromise = audioRef.current.play();
    if (playPromise !== undefined) {
        playPromise.catch(e => console.log("Game audio play error", e));
    }

    // Resume context if suspended (browser policy)
    if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
    }
  };

  const getRandomTrack = () => {
    if (tracks.length === 0) return initialTrack;
    const idx = Math.floor(Math.random() * tracks.length);
    return tracks[idx];
  };

  const resetGame = () => {
    gameState.current = {
      birdY: 300,
      birdVelocity: 0,
      pipes: [],
      score: 0,
      isPlaying: true,
      isGameOver: false,
      frameCount: 0
    };
    setScore(0);
    setIsPlaying(true);
    setIsGameOver(false);
    
    const nextTrack = getRandomTrack();
    playSnippet(nextTrack);
  };

  const handleJump = () => {
    // Resume audio context on user interaction if needed
    if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
    }

    if (gameState.current.isGameOver) return;
    if (!gameState.current.isPlaying) {
      setIsPlaying(true);
      gameState.current.isPlaying = true;
    }
    gameState.current.birdVelocity = JUMP;
  };

  // Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const dataArray = new Uint8Array(analyserRef.current ? analyserRef.current.frequencyBinCount : 0);

    const render = () => {
      const state = gameState.current;
      const width = canvas.width;
      const height = canvas.height;

      // Clear Canvas
      ctx.clearRect(0, 0, width, height);

      // Background Gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#1c1c1e");
      gradient.addColorStop(1, "#000000");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // --- SUBTLE VISUALIZER ---
      if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const barWidth = (width / dataArray.length) * 2.5;
          let barX = 0;

          for(let i = 0; i < dataArray.length; i++) {
              const barHeight = (dataArray[i] / 255) * (height / 2); // Max height half screen
              
              ctx.fillStyle = `rgba(250, 45, 72, 0.15)`; // Subtle Apple Music Red
              ctx.fillRect(barX, height - barHeight, barWidth, barHeight);

              barX += barWidth + 1;
          }
      }

      if (state.isPlaying && !state.isGameOver) {
        // Physics
        state.birdVelocity += GRAVITY;
        state.birdY += state.birdVelocity;
        state.frameCount++;

        // Spawn Pipes
        if (state.frameCount % PIPE_SPAWN_RATE === 0) {
          const minGapY = 100;
          const maxGapY = height - 100 - PIPE_GAP;
          const gapY = Math.floor(Math.random() * (maxGapY - minGapY + 1)) + minGapY;
          state.pipes.push({ x: width, gapY, passed: false });
        }

        // Update Pipes
        state.pipes.forEach(pipe => {
          pipe.x -= PIPE_SPEED;
        });

        // Remove off-screen pipes
        state.pipes = state.pipes.filter(p => p.x + PIPE_WIDTH > 0);

        // Collision Detection
        // 1. Floor/Ceiling
        if (state.birdY + BIRD_SIZE > height || state.birdY < 0) {
          endGame();
        }

        // 2. Pipes
        const birdLeft = 100; 
        const birdRight = 100 + BIRD_SIZE;
        const birdTop = state.birdY;
        const birdBottom = state.birdY + BIRD_SIZE;

        state.pipes.forEach(pipe => {
          const pipeLeft = pipe.x;
          const pipeRight = pipe.x + PIPE_WIDTH;
          
          if (birdRight > pipeLeft && birdLeft < pipeRight) {
             if (birdTop < pipe.gapY || birdBottom > pipe.gapY + PIPE_GAP) {
                 endGame();
             }
          }

          // Score Logic
          if (!pipe.passed && birdLeft > pipeRight) {
             pipe.passed = true;
             state.score += 1;
             setScore(state.score);
             // Change Song on Score
             const nextTrack = getRandomTrack();
             playSnippet(nextTrack);
          }
        });
      }

      // Draw Pipes
      ctx.fillStyle = "#fa2d48";
      state.pipes.forEach(pipe => {
        ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.gapY);
        ctx.fillRect(pipe.x, pipe.gapY + PIPE_GAP, PIPE_WIDTH, height - (pipe.gapY + PIPE_GAP));
        
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.strokeRect(pipe.x, 0, PIPE_WIDTH, pipe.gapY);
        ctx.strokeRect(pipe.x, pipe.gapY + PIPE_GAP, PIPE_WIDTH, height - (pipe.gapY + PIPE_GAP));
      });

      // Draw Bird
      ctx.save();
      ctx.beginPath();
      ctx.arc(100 + BIRD_SIZE/2, state.birdY + BIRD_SIZE/2, BIRD_SIZE/2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      
      try {
        ctx.drawImage(birdImgRef.current, 100, state.birdY, BIRD_SIZE, BIRD_SIZE);
      } catch (e) {
        ctx.fillStyle = "white";
        ctx.fill();
      }
      ctx.restore();
      
      // Bird Border
      ctx.beginPath();
      ctx.arc(100 + BIRD_SIZE/2, state.birdY + BIRD_SIZE/2, BIRD_SIZE/2, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "white";
      ctx.stroke();

      animationFrameId = requestAnimationFrame(render);
    };

    const endGame = () => {
        gameState.current.isGameOver = true;
        setIsGameOver(true);
        if (audioRef.current) audioRef.current.pause();
        if (gameState.current.score > highScore) {
            setHighScore(gameState.current.score);
        }
    };

    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, [highScore, tracks]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-lg animate-in fade-in duration-200">
      
      <div className="relative bg-[#1c1c1e] rounded-2xl shadow-2xl overflow-hidden border border-zinc-700 max-w-2xl w-full mx-4">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-zinc-900 border-b border-zinc-800">
           <div className="flex items-center gap-2">
               <span className="text-[#fa2d48] font-bold text-lg">Flappy Song</span>
               <span className="text-zinc-500 text-sm px-2 border-l border-zinc-700">Change tracks to survive</span>
           </div>
           <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full transition-colors"><X className="w-5 h-5 text-zinc-400 hover:text-white"/></button>
        </div>

        {/* Game Canvas */}
        <div className="relative cursor-pointer" onClick={handleJump}>
            <canvas 
                ref={canvasRef} 
                width={600} 
                height={500} 
                className="w-full h-[500px] block bg-black"
            />
            
            {/* Overlay UI: Start Screen */}
            {!isPlaying && !isGameOver && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 pointer-events-none">
                    <Play className="w-16 h-16 text-white mb-4 fill-white" />
                    <h2 className="text-2xl font-bold text-white mb-2">Tap to Jump</h2>
                    <p className="text-zinc-300">Every point changes the song!</p>
                </div>
            )}

            {/* Overlay UI: Score */}
            {isPlaying && !isGameOver && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 text-6xl font-bold text-white drop-shadow-lg pointer-events-none opacity-80">
                    {score}
                </div>
            )}
            
            {/* Overlay UI: Current Song Info */}
            <div className="absolute bottom-4 left-4 right-4 bg-black/60 backdrop-blur-md rounded-xl p-3 flex items-center gap-3 pointer-events-none transition-all duration-300">
                <img src={currentGameTrack.coverUrl || "https://picsum.photos/50"} className="w-10 h-10 rounded-md" />
                <div className="flex flex-col overflow-hidden">
                    <span className="text-white font-medium text-sm truncate">{currentGameTrack.title}</span>
                    <span className="text-zinc-400 text-xs truncate">{currentGameTrack.artist}</span>
                </div>
            </div>

            {/* Overlay UI: Game Over */}
            {isGameOver && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm z-20">
                    <Trophy className="w-16 h-16 text-yellow-500 mb-2" />
                    <h2 className="text-4xl font-bold text-white mb-2">Game Over</h2>
                    <div className="flex gap-8 mb-8 text-center">
                        <div>
                            <p className="text-zinc-400 text-xs uppercase tracking-wider">Score</p>
                            <p className="text-3xl font-bold text-white">{score}</p>
                        </div>
                        <div>
                            <p className="text-zinc-400 text-xs uppercase tracking-wider">Best</p>
                            <p className="text-3xl font-bold text-white">{highScore}</p>
                        </div>
                    </div>
                    
                    <button 
                        onClick={(e) => { e.stopPropagation(); resetGame(); }}
                        className="flex items-center gap-2 bg-[#fa2d48] hover:bg-red-600 text-white px-8 py-3 rounded-full font-bold text-lg transition-transform active:scale-95 shadow-lg"
                    >
                        <RotateCcw className="w-5 h-5" />
                        Play Again
                    </button>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};