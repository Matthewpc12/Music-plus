import React, { useEffect, useRef, useState } from 'react';
import { X, Play, Zap, Flame, Skull, Music2 } from 'lucide-react';
import { Track } from '../types';

interface RhythmGameProps {
  track: Track;
  difficulty: 'easy' | 'normal' | 'hard' | 'demon';
  onClose: () => void;
}

export const RhythmGame: React.FC<RhythmGameProps> = ({ track, difficulty, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [health, setHealth] = useState(100);
  const [feedback, setFeedback] = useState<{ text: string, color: string, id: number } | null>(null);

  // Audio Context Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const delayNodeRef = useRef<DelayNode | null>(null);

  // Use a Ref for health to avoid re-rendering entire component every frame
  const healthRef = useRef(100);

  // Game Constants based on difficulty
  const SETTINGS = {
    easy: { speed: 5, spawnThreshold: 220, lanes: 2, drain: 0.05, heal: 2 },
    normal: { speed: 7, spawnThreshold: 200, lanes: 4, drain: 0.08, heal: 1.5 },
    hard: { speed: 10, spawnThreshold: 180, lanes: 4, drain: 0.15, heal: 1 },
    demon: { speed: 14, spawnThreshold: 170, lanes: 4, drain: 0.25, heal: 0.5 }
  }[difficulty];

  // Note Travel Time calculation
  const HIT_Y_PERCENT = 0.85;
  
  const gameState = useRef({
    notes: [] as { lane: number, y: number, id: number, handled: boolean }[],
    noteIdCounter: 0,
    lastSpawnTime: 0,
    startTime: 0,
    isPlaying: false,
    isGameOver: false,
    particles: [] as { x: number, y: number, vx: number, vy: number, life: number, color: string }[]
  });

  // Init Audio & Game
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.crossOrigin = "anonymous";
    audioRef.current.src = track.url;
    audioRef.current.volume = 0.6;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioContextRef.current = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    // Create Audio Graph: Source -> Analyser -> Delay -> Destination
    if (audioRef.current) {
        const source = ctx.createMediaElementSource(audioRef.current);
        sourceNodeRef.current = source;
        
        const delay = ctx.createDelay(5.0);
        delayNodeRef.current = delay;
        
        // Calculate required delay based on screen height estimation
        const estimatedHeight = window.innerHeight * 0.8; 
        const pixelsToTravel = estimatedHeight * HIT_Y_PERCENT;
        const framesToTravel = pixelsToTravel / SETTINGS.speed;
        const secondsDelay = framesToTravel / 60;
        
        delay.delayTime.value = secondsDelay;

        // Path 1: Analysis (Immediate)
        source.connect(analyser);
        
        // Path 2: Audio Output (Delayed)
        source.connect(delay);
        delay.connect(ctx.destination);
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [track, difficulty]);

  const startGame = () => {
    if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
    }
    audioRef.current?.play().then(() => {
        setIsPlaying(true);
        gameState.current.isPlaying = true;
        healthRef.current = 100;
        setHealth(100);
    }).catch(e => console.error(e));
  };

  const updateHealth = (amount: number) => {
      healthRef.current = Math.min(100, healthRef.current + amount);
      if (healthRef.current <= 0) {
          gameState.current.isGameOver = true;
          setIsGameOver(true);
          audioRef.current?.pause();
      }
      // Sync UI state occasionally or on large changes, but not every frame in updateHealth itself if called often
      // We will sync in render loop throttled
  };

  const handleInput = (lane: number) => {
    if (gameState.current.isGameOver || !gameState.current.isPlaying) return;
    
    // Lane mapping for Easy mode (2 lanes centered)
    let actualLane = lane;
    if (difficulty === 'easy') {
        if (lane === 0 || lane === 3) return; // Ignore outer keys
    }

    const HIT_LINE_Y = canvasRef.current ? canvasRef.current.height * HIT_Y_PERCENT : 500;
    const HIT_WINDOW = 60; // Pixels

    // Find closest note in this lane
    const noteIndex = gameState.current.notes.findIndex(n => 
        n.lane === actualLane && 
        !n.handled && 
        Math.abs(n.y - HIT_LINE_Y) < HIT_WINDOW
    );

    if (noteIndex !== -1) {
        const note = gameState.current.notes[noteIndex];
        const distance = Math.abs(note.y - HIT_LINE_Y);
        
        gameState.current.notes[noteIndex].handled = true;
        
        // Judgment
        let points = 0;
        let healthChange = 0;
        let text = "";
        let color = "";

        if (distance < 15) {
            text = "PERFECT!!";
            color = "#00e5ff"; // Cyan
            points = 300;
            healthChange = SETTINGS.heal;
            createExplosion(note.lane, HIT_LINE_Y, color);
        } else if (distance < 40) {
            text = "GREAT";
            color = "#00ff00"; // Green
            points = 100;
            healthChange = SETTINGS.heal * 0.5;
            createExplosion(note.lane, HIT_LINE_Y, color);
        } else {
            text = "GOOD";
            color = "#ffff00"; // Yellow
            points = 50;
            healthChange = 0;
        }

        setFeedback({ text, color, id: Date.now() });
        setScore(s => s + (points * multiplier));
        setCombo(c => {
            const newCombo = c + 1;
            setMultiplier(1 + Math.floor(newCombo / 10) * 0.5);
            return newCombo;
        });
        updateHealth(healthChange);

    }
  };

  const createExplosion = (lane: number, y: number, color: string) => {
      const laneWidth = canvasRef.current ? canvasRef.current.width / 4 : 80;
      const x = (lane * laneWidth) + (laneWidth / 2);
      
      for(let i=0; i<10; i++) {
          gameState.current.particles.push({
              x: x,
              y: y,
              vx: (Math.random() - 0.5) * 10,
              vy: (Math.random() - 0.5) * 10,
              life: 1.0,
              color: color
          });
      }
  };

  // Input Listeners
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.repeat) return;
          switch(e.code) {
              case 'KeyD': handleInput(0); break;
              case 'KeyF': handleInput(1); break;
              case 'KeyJ': handleInput(2); break;
              case 'KeyK': handleInput(3); break;
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [difficulty]);

  // Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle Resize
    const resize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    let animationFrameId: number;
    let frameCount = 0;
    const dataArray = new Uint8Array(analyserRef.current?.frequencyBinCount || 0);

    const render = () => {
        const width = canvas.width;
        const height = canvas.height;
        const LANE_COUNT = 4;
        const LANE_WIDTH = width / LANE_COUNT;
        const HIT_Y = height * HIT_Y_PERCENT;

        frameCount++;

        // Clear
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);

        // DEMON MODE WOBBLE
        if (difficulty === 'demon') {
            const wobble = Math.sin(Date.now() / 200) * 5;
            ctx.save();
            ctx.translate(wobble, 0);
        }

        // Draw Lanes
        for (let i = 0; i < LANE_COUNT; i++) {
            ctx.fillStyle = (i % 2 === 0) ? '#111' : '#161616';
            ctx.fillRect(i * LANE_WIDTH, 0, LANE_WIDTH, height);
            
            // Hit Line marker
            ctx.fillStyle = '#333';
            ctx.fillRect(i * LANE_WIDTH, HIT_Y - 5, LANE_WIDTH, 10);
            
            // Key Hints
            ctx.fillStyle = '#555';
            ctx.font = "bold 20px Arial";
            ctx.textAlign = "center";
            const keys = ['D', 'F', 'J', 'K'];
            ctx.fillText(keys[i], (i * LANE_WIDTH) + (LANE_WIDTH/2), HIT_Y + 40);
        }

        // Draw Hit Line Global
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#fa2d48";
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, HIT_Y - 2, width, 4);
        ctx.shadowBlur = 0;

        if (gameState.current.isPlaying && !gameState.current.isGameOver) {
            const state = gameState.current;

            // --- SPAWN NOTES (BEAT DETECTION) ---
            if (analyserRef.current) {
                analyserRef.current.getByteFrequencyData(dataArray);
                
                // Bass (Lanes 1 & 2 in normal/hard)
                const bassAvg = (dataArray[1] + dataArray[2] + dataArray[3]) / 3;
                // Mids/Highs (Outer lanes)
                const midAvg = (dataArray[20] + dataArray[21] + dataArray[22]) / 3;

                const now = Date.now();
                if (now - state.lastSpawnTime > (difficulty === 'demon' ? 80 : 120)) {
                    
                    const threshold = SETTINGS.spawnThreshold;
                    
                    if (difficulty === 'easy') {
                        if (bassAvg > threshold) {
                            state.notes.push({ lane: Math.random() > 0.5 ? 1 : 2, y: -50, id: state.noteIdCounter++, handled: false });
                            state.lastSpawnTime = now;
                        }
                    } else {
                         if (bassAvg > threshold) {
                             const lane = Math.random() > 0.5 ? 1 : 2;
                             state.notes.push({ lane, y: -50, id: state.noteIdCounter++, handled: false });
                             state.lastSpawnTime = now;
                         } else if (midAvg > threshold * 0.9) {
                             const lane = Math.random() > 0.5 ? 0 : 3;
                             state.notes.push({ lane, y: -50, id: state.noteIdCounter++, handled: false });
                             state.lastSpawnTime = now;
                         }
                    }
                }
            }

            // --- MOVE & UPDATE NOTES ---
            for (let i = state.notes.length - 1; i >= 0; i--) {
                const note = state.notes[i];
                note.y += SETTINGS.speed;

                // Miss Detection
                if (note.y > height + 50) {
                    if (!note.handled) {
                        setCombo(0);
                        setMultiplier(1);
                        updateHealth(-10); 
                        setFeedback({ text: "MISS", color: "#ff0000", id: Date.now() });
                    }
                    state.notes.splice(i, 1);
                    continue;
                }

                // Draw Note
                if (!note.handled) {
                    const noteX = (note.lane * LANE_WIDTH) + (LANE_WIDTH / 2);
                    
                    const color = note.lane === 0 || note.lane === 3 ? '#00e5ff' : '#fa2d48'; 
                    
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = color;
                    ctx.fillStyle = color;
                    
                    ctx.beginPath();
                    ctx.arc(noteX, note.y, 35, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // Inner white
                    ctx.fillStyle = "#fff";
                    ctx.beginPath();
                    ctx.arc(noteX, note.y, 20, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
            }

            // --- PARTICLES ---
            for (let i = state.particles.length - 1; i >= 0; i--) {
                const p = state.particles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.life -= 0.05;
                
                if (p.life <= 0) {
                    state.particles.splice(i, 1);
                } else {
                    ctx.globalAlpha = p.life;
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
            }

            // Health Drain
            if (state.isPlaying) {
               updateHealth(-SETTINGS.drain);
            }
            
            // Sync React State for UI occasionally (every 10 frames = ~6 times/sec)
            // This prevents the UI thread from being overwhelmed by state updates
            if (frameCount % 10 === 0) {
                setHealth(healthRef.current);
            }
        }
        
        if (difficulty === 'demon') ctx.restore();

        animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => {
        cancelAnimationFrame(animationFrameId);
        window.removeEventListener('resize', resize);
    };
  }, [difficulty]);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center overflow-hidden">
        {/* Canvas Layer */}
        <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

        {/* HUD Layer */}
        <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start pointer-events-none">
            {/* Score & Combo */}
            <div className="flex flex-col gap-1">
                <div className="text-white text-4xl font-bold italic tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                    {score.toLocaleString()}
                </div>
                {combo > 5 && (
                    <div className="text-[#fa2d48] text-2xl font-black animate-bounce">
                        {combo} COMBO
                    </div>
                )}
            </div>
            
            {/* Health Bar */}
            <div className="w-64 h-8 bg-zinc-800 rounded-full overflow-hidden border-2 border-zinc-600 relative">
                 <div 
                    className={`h-full transition-all duration-100 ${health < 20 ? 'bg-red-600 animate-pulse' : 'bg-green-500'}`}
                    style={{ width: `${health}%` }}
                 />
            </div>

            {/* Exit Button */}
            <button onClick={onClose} className="pointer-events-auto p-2 bg-white/10 rounded-full hover:bg-white/20">
                <X className="text-white" />
            </button>
        </div>
        
        {/* Feedback Popup */}
        {feedback && (
            <div key={feedback.id} className="absolute top-1/3 left-1/2 -translate-x-1/2 text-5xl font-black animate-ping-once pointer-events-none" style={{ color: feedback.color, textShadow: '0 0 20px currentColor' }}>
                {feedback.text}
            </div>
        )}

        {/* Start Overlay */}
        {!isPlaying && !isGameOver && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20">
                <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600 mb-2 italic">NEON RHYTHM</h1>
                <div className="flex items-center gap-2 mb-8">
                    {difficulty === 'easy' && <Zap className="text-green-400" />}
                    {difficulty === 'normal' && <Music2 className="text-blue-400" />}
                    {difficulty === 'hard' && <Flame className="text-orange-400" />}
                    {difficulty === 'demon' && <Skull className="text-red-600 w-8 h-8" />}
                    <span className="text-2xl text-white font-bold uppercase">{difficulty} MODE</span>
                </div>
                
                <div className="flex gap-4 mb-8 text-zinc-400 text-sm">
                    <div className="bg-zinc-900 px-4 py-2 rounded-lg border border-zinc-700">Keys: D F J K</div>
                    <div className="bg-zinc-900 px-4 py-2 rounded-lg border border-zinc-700">Touch: Lanes</div>
                </div>

                <button 
                    onClick={startGame}
                    className="bg-white text-black px-12 py-4 rounded-full font-bold text-xl hover:scale-105 transition-transform shadow-[0_0_30px_rgba(255,255,255,0.4)]"
                >
                    START TRACK
                </button>
            </div>
        )}

        {/* Game Over Overlay */}
        {isGameOver && (
            <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-20 animate-in zoom-in duration-300">
                <Skull className="w-24 h-24 text-red-600 mb-4 animate-pulse" />
                <h2 className="text-5xl font-bold text-white mb-2">FAILED</h2>
                <p className="text-zinc-400 mb-8 text-xl">The rhythm consumed you.</p>
                
                <div className="flex gap-12 mb-8 text-center">
                    <div>
                        <div className="text-xs text-zinc-500 uppercase">Final Score</div>
                        <div className="text-4xl font-bold text-white">{score}</div>
                    </div>
                    <div>
                        <div className="text-xs text-zinc-500 uppercase">Max Combo</div>
                        <div className="text-4xl font-bold text-white">{combo}</div>
                    </div>
                </div>

                <div className="flex gap-4">
                    <button onClick={onClose} className="px-8 py-3 rounded-full bg-zinc-800 text-white hover:bg-zinc-700 font-bold">
                        Give Up
                    </button>
                    <button onClick={() => { setHealth(100); setIsGameOver(false); setIsPlaying(false); setScore(0); setCombo(0); gameState.current.notes = []; startGame(); }} className="px-8 py-3 rounded-full bg-[#fa2d48] text-white hover:bg-red-600 font-bold shadow-lg">
                        Retry
                    </button>
                </div>
            </div>
        )}
        
        {/* Touch Controls Overlay */}
        <div className="absolute inset-0 flex z-10">
            {[0, 1, 2, 3].map(lane => (
                <div 
                    key={lane} 
                    className="flex-1 active:bg-white/10 transition-colors"
                    onTouchStart={(e) => { e.preventDefault(); handleInput(lane); }}
                    onMouseDown={() => handleInput(lane)}
                ></div>
            ))}
        </div>
    </div>
  );
};