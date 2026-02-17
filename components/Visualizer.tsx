
import React, { useEffect, useRef, useState } from 'react';
/* Added import for CustomVisualizerConfig */
import { CustomVisualizerConfig } from '../types';

/* Added 'vinyl', 'starfield', and 'custom' to VisualizerStyle */
export type VisualizerStyle = 'normal' | 'glow' | 'bars' | 'retro' | 'pixel' | 'lcd' | 'wave' | 'spectrum' | 'dna' | 'orb' | 'matrix' | 'grid' | 'vinyl' | 'starfield' | 'custom' | 'none';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  coverUrl?: string;
  className?: string;
  style?: VisualizerStyle;
  /* Added customConfig prop */
  customConfig?: CustomVisualizerConfig;
}

// Fixed 'Cannot find namespace React' by adding React to imports
export const Visualizer: React.FC<VisualizerProps> = ({ analyser, coverUrl, className, style = 'normal', customConfig }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const [colors, setColors] = useState({ bg: [10, 10, 10], accent: [250, 45, 72] });
  
  // Keep track of matrix drops state across renders
  const dropsRef = useRef<number[]>([]);

  // Extract colors from cover image
  useEffect(() => {
    if (!coverUrl) return;
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = coverUrl;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1; canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      try {
        ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        setColors({ 
          bg: [r, g, b], 
          accent: [r, g, b]
        });
      } catch (e) { console.warn("Visualizer color extraction failed", e); }
    };
  }, [coverUrl]);

  useEffect(() => {
    if (!analyser || !canvasRef.current || style === 'none') return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    // Disable smoothing for pixel style
    ctx.imageSmoothingEnabled = style !== 'pixel';
    
    ctx.scale(dpr, dpr);

    const bufferLength = analyser.frequencyBinCount;
    if (bufferLength === 0) return;

    const dataArray = new Uint8Array(bufferLength);
    const timeArray = new Uint8Array(bufferLength);

    const [ar, ag, ab] = colors.accent;
    const [br, bg, bb] = colors.bg;

    // Initialize Matrix Drops if needed
    if (style === 'matrix') {
        const columns = Math.ceil(rect.width / 20);
        if (dropsRef.current.length !== columns) {
             dropsRef.current = new Array(columns).fill(0).map(() => Math.random() * rect.height);
        }
    }

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      
      const w = rect.width;
      const h = rect.height;
      
      if (!Number.isFinite(w) || !Number.isFinite(h) || w === 0 || h === 0) return;

      const cx = w / 2;
      const cy = h / 2;

      /* Handling for Custom Visualizer Style */
      if (style === 'custom' && customConfig) {
          analyser.getByteFrequencyData(dataArray);
          let bass = 0, mid = 0, treble = 0;
          for (let i = 0; i < 10; i++) bass += dataArray[i];
          for (let i = 10; i < 50; i++) mid += dataArray[i];
          for (let i = 50; i < 100; i++) treble += dataArray[i];
          bass = bass / 10 / 255;
          mid = mid / 40 / 255;
          treble = treble / 50 / 255;

          ctx.fillStyle = customConfig.background || 'black';
          ctx.fillRect(0, 0, w, h);

          customConfig.elements.forEach(el => {
              ctx.save();
              const intensity = el.reactivity === 'bass' ? bass : el.reactivity === 'mids' ? mid : el.reactivity === 'treble' ? treble : 0;
              let drawX = (el.x / 100) * w;
              let drawY = (el.y / 100) * h;
              let drawScale = 1;
              let drawOpacity = el.opacity;
              let drawRotation = (el.rotation * Math.PI) / 180;

              if (el.reactiveProperty === 'scale') drawScale = 1 + (intensity * 2);
              if (el.reactiveProperty === 'opacity') drawOpacity = Math.min(1, el.opacity + intensity);
              if (el.reactiveProperty === 'rotation') drawRotation += intensity * Math.PI;

              ctx.translate(drawX, drawY);
              ctx.rotate(drawRotation);
              ctx.scale(drawScale, drawScale);
              ctx.globalAlpha = drawOpacity;
              ctx.shadowBlur = el.glow * intensity * 2;
              ctx.shadowColor = el.color;
              ctx.fillStyle = el.color;
              ctx.strokeStyle = el.color;
              ctx.lineWidth = 2;

              if (el.type === 'circle') {
                  ctx.beginPath();
                  ctx.arc(0, 0, el.size / 2, 0, Math.PI * 2);
                  ctx.fill();
              } else if (el.type === 'rect') {
                  ctx.fillRect(-el.width / 2, -el.height / 2, el.width, el.height);
              } else if (el.type === 'line') {
                  ctx.beginPath();
                  ctx.moveTo(-el.width / 2, 0);
                  ctx.lineTo(el.width / 2, 0);
                  ctx.stroke();
              } else if (el.type === 'star') {
                  const spikes = 5;
                  const outerRadius = el.size / 2;
                  const innerRadius = el.size / 4;
                  let rot = Math.PI / 2 * 3;
                  let x = 0; let y = 0;
                  let step = Math.PI / spikes;
                  ctx.beginPath();
                  ctx.moveTo(0, -outerRadius);
                  for (let i = 0; i < spikes; i++) {
                      x = Math.cos(rot) * outerRadius; y = Math.sin(rot) * outerRadius;
                      ctx.lineTo(x, y); rot += step;
                      x = Math.cos(rot) * innerRadius; y = Math.sin(rot) * innerRadius;
                      ctx.lineTo(x, y); rot += step;
                  }
                  ctx.lineTo(0, -outerRadius); ctx.closePath(); ctx.fill();
              }
              ctx.restore();
          });
          return;
      }

      // Clear with style-dependent background
      if (style === 'retro') {
          ctx.fillStyle = 'rgba(0, 20, 0, 1)'; // Dark green bg for retro
          ctx.fillRect(0, 0, w, h);
      } else if (style === 'matrix') {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; // Fade trail
          ctx.fillRect(0, 0, w, h);
      } else if (style === 'vinyl' || style === 'starfield') {
          ctx.fillStyle = 'black';
          ctx.fillRect(0, 0, w, h);
      } else {
          ctx.clearRect(0, 0, w, h);
      }

      if (style === 'normal') {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
          
          const volumeRatio = bufferLength > 0 ? sum / (bufferLength * 255) : 0;
          if (!Number.isFinite(volumeRatio)) return;

          // Deep Neon Background
          const pulse = 1 + (volumeRatio * 0.5);
          const r = w * 0.9 * pulse;
          if (Number.isFinite(r) && r > 0) {
            const bgGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            bgGradient.addColorStop(0, `rgba(${br}, ${bg}, ${bb}, 0.4)`);
            bgGradient.addColorStop(0.5, `rgba(${br * 0.5}, ${bg * 0.5}, ${bb * 0.5}, 0.1)`);
            bgGradient.addColorStop(1, `rgba(0,0,0,0)`);
            ctx.fillStyle = bgGradient;
            ctx.fillRect(0, 0, w, h);
          }

          // Rings
          ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${0.2 + volumeRatio})`;
          ctx.lineWidth = 2 + volumeRatio * 10;
          ctx.beginPath();
          ctx.arc(cx, cy, 50 + volumeRatio * 200, 0, Math.PI * 2);
          ctx.stroke();

          // Bars
          const barsToDraw = 64;
          const barWidth = (w / (barsToDraw * 1.5));
          if (!Number.isFinite(barWidth) || barWidth <= 0) return;

          ctx.shadowBlur = 20 * volumeRatio;
          ctx.shadowColor = `rgba(${ar}, ${ag}, ${ab}, 0.8)`;

          for (let i = 0; i < barsToDraw; i++) {
            const idx = i * Math.floor(bufferLength / barsToDraw);
            const val = dataArray[idx] || 0;
            const barHeight = (val / 255) * h * 0.45 * (1 + volumeRatio);
            
            if (!Number.isFinite(barHeight)) continue;

            const xOffset = i * (barWidth + 4);

            const barGrad = ctx.createLinearGradient(0, cy - barHeight/2, 0, cy + barHeight/2);
            barGrad.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 0)`);
            barGrad.addColorStop(0.5, `rgba(${ar + 50}, ${ag + 50}, ${ab + 50}, 0.9)`);
            barGrad.addColorStop(1, `rgba(${ar}, ${ag}, ${ab}, 0)`);
            ctx.fillStyle = barGrad;

            if (ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(cx + xOffset, cy - barHeight/2, barWidth, barHeight, barWidth/2);
                ctx.fill();
                ctx.beginPath();
                ctx.roundRect(cx - xOffset - barWidth, cy - barHeight/2, barWidth, barHeight, barWidth/2);
                ctx.fill();
            } else {
                ctx.fillRect(cx + xOffset, cy - barHeight/2, barWidth, barHeight);
                ctx.fillRect(cx - xOffset - barWidth, cy - barHeight/2, barWidth, barHeight);
            }
          }
          ctx.shadowBlur = 0;

      } else if (style === 'glow') {
          analyser.getByteFrequencyData(dataArray);
          
          // Heavy Bloom Effect
          ctx.globalCompositeOperation = 'screen';
          const bars = 32;
          const angleStep = (Math.PI * 2) / bars;
          const radius = 100;

          for(let i=0; i<bars; i++) {
              const val = dataArray[i * 4] || 0;
              const len = (val / 255) * 200;
              
              const x = cx + Math.cos(i * angleStep) * radius;
              const y = cy + Math.sin(i * angleStep) * radius;
              const endX = cx + Math.cos(i * angleStep) * (radius + len);
              const endY = cy + Math.sin(i * angleStep) * (radius + len);

              ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, 0.5)`;
              ctx.lineWidth = 15;
              ctx.lineCap = 'round';
              ctx.shadowBlur = 30;
              ctx.shadowColor = `rgba(${ar}, ${ag}, ${ab}, 1)`;
              
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(endX, endY);
              ctx.stroke();
          }
          ctx.globalCompositeOperation = 'source-over';
          ctx.shadowBlur = 0;

      } else if (style === 'bars') {
          analyser.getByteFrequencyData(dataArray);
          const bars = 40;
          const gap = 4;
          const totalGap = (bars - 1) * gap;
          const barWidth = (w - totalGap) / bars;

          if (Number.isFinite(barWidth) && barWidth > 0) {
              for (let i = 0; i < bars; i++) {
                  const val = dataArray[i * 3] || 0;
                  const barHeight = (val / 255) * h;
                  const x = i * (barWidth + gap);
                  
                  // Segmented look
                  const segHeight = 6;
                  const segGap = 2;
                  const segments = Math.floor(barHeight / (segHeight + segGap));
                  
                  for(let j=0; j<segments; j++) {
                      const y = h - (j * (segHeight + segGap));
                      // Color gradient based on height
                      if (j > 30) ctx.fillStyle = '#ff0000';
                      else if (j > 20) ctx.fillStyle = '#ffff00';
                      else ctx.fillStyle = '#00ff00';
                      
                      ctx.fillRect(x, y - segHeight, barWidth, segHeight);
                  }
              }
          }

      } else if (style === 'retro') {
          analyser.getByteTimeDomainData(timeArray);
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#00ff00';
          ctx.shadowBlur = 5;
          ctx.shadowColor = '#00ff00';
          
          ctx.beginPath();
          const sliceWidth = w * 1.0 / bufferLength;
          let x = 0;
          
          if (Number.isFinite(sliceWidth)) {
              for(let i = 0; i < bufferLength; i++) {
                  const v = timeArray[i] / 128.0;
                  const y = v * h/2;
                  
                  if(i === 0) ctx.moveTo(x, y);
                  else ctx.lineTo(x, y);
                  
                  x += sliceWidth;
              }
              ctx.stroke();
          }
          
          // Grid lines
          ctx.strokeStyle = 'rgba(0, 255, 0, 0.1)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          // Horizontal grid
          for(let y=0; y<h; y+=40) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
          // Vertical grid
          for(let x=0; x<w; x+=40) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
          ctx.stroke();
          ctx.shadowBlur = 0;

      } else if (style === 'pixel') {
          analyser.getByteFrequencyData(dataArray);
          const cols = 16;
          const rows = 12;
          const cellW = w / cols;
          const cellH = h / rows;

          for(let i=0; i<cols; i++) {
              const val = dataArray[i * 4] || 0;
              const activeRows = Math.floor((val / 255) * rows);
              
              for(let j=0; j<activeRows; j++) {
                   const y = h - ((j+1) * cellH);
                   ctx.fillStyle = `rgb(${ar}, ${ag}, ${ab})`;
                   ctx.fillRect(i * cellW + 2, y + 2, cellW - 4, cellH - 4);
              }
          }

      } else if (style === 'lcd') {
          analyser.getByteFrequencyData(dataArray);
          const bars = 24;
          const barWidth = w / bars;
          
          for(let i=0; i<bars; i++) {
              const val = dataArray[i * 6] || 0;
              const percent = val / 255;
              
              // Draw ghost/inactive segments
              ctx.fillStyle = 'rgba(20, 20, 20, 0.5)';
              ctx.fillRect(i * barWidth + 2, 0, barWidth - 4, h);
              
              // Draw active
              const barH = percent * h;
              const grad = ctx.createLinearGradient(0, h-barH, 0, h);
              grad.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 1)`);
              grad.addColorStop(1, `rgba(${ar*0.5}, ${ag*0.5}, ${ab*0.5}, 0.5)`);
              
              ctx.fillStyle = grad;
              ctx.fillRect(i * barWidth + 2, h - barH, barWidth - 4, barH);
              
              // Scanline effect
              ctx.fillStyle = 'rgba(0,0,0,0.2)';
              for(let y=0; y<h; y+=4) {
                  ctx.fillRect(i*barWidth, y, barWidth, 1);
              }
          }

      } else if (style === 'wave') {
          analyser.getByteTimeDomainData(timeArray);
          ctx.lineWidth = 4;
          ctx.strokeStyle = `rgb(${ar}, ${ag}, ${ab})`;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          
          ctx.beginPath();
          const sliceWidth = w / bufferLength;
          let x = 0;
          
          if (Number.isFinite(sliceWidth)) {
              for(let i=0; i<bufferLength; i++) {
                  const v = timeArray[i] / 128.0;
                  const y = (v * h/2) + (Math.sin(i * 0.1) * 10); // add subtle motion
                  if (i===0) ctx.moveTo(x, y);
                  else ctx.lineTo(x, y);
                  x += sliceWidth;
              }
              ctx.stroke();
          }
          
      } else if (style === 'spectrum') {
          analyser.getByteFrequencyData(dataArray);
          const barWidth = (w / bufferLength) * 2.5;
          let barX = 0;
          
          const grad = ctx.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 1)`);
          grad.addColorStop(1, `rgba(${br}, ${bg}, ${bb}, 1)`);
          ctx.fillStyle = grad;

          for(let i = 0; i < bufferLength; i++) {
              const barHeight = (dataArray[i] / 255) * h;
              ctx.fillRect(barX, h - barHeight, barWidth, barHeight);
              barX += barWidth + 1;
          }

      } else if (style === 'dna') {
          analyser.getByteTimeDomainData(timeArray);
          ctx.lineWidth = 3;
          
          for(let i=0; i<bufferLength; i+=4) {
              const v = (timeArray[i] / 128.0) * 50; // Amplitude
              const y = (i / bufferLength) * h;
              const x1 = cx + Math.sin(y * 0.05 + Date.now() * 0.002) * v;
              const x2 = cx - Math.sin(y * 0.05 + Date.now() * 0.002) * v;
              
              ctx.fillStyle = `rgb(${ar}, ${ag}, ${ab})`;
              ctx.beginPath();
              ctx.arc(x1, y, 4, 0, Math.PI * 2);
              ctx.fill();
              
              ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, 0.5)`;
              ctx.beginPath();
              ctx.arc(x2, y, 4, 0, Math.PI * 2);
              ctx.fill();
              
              // Connecting line
              ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, 0.2)`;
              ctx.beginPath();
              ctx.moveTo(x1, y);
              ctx.lineTo(x2, y);
              ctx.stroke();
          }

      } else if (style === 'orb') {
          analyser.getByteFrequencyData(dataArray);
          let avg = 0;
          for(let i=0; i<bufferLength; i++) avg += dataArray[i];
          avg = avg / bufferLength;
          
          const radius = 100 + (avg * 0.5);
          
          const grad = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius);
          grad.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 1)`);
          grad.addColorStop(0.5, `rgba(${ar}, ${ag}, ${ab}, 0.2)`);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();
          
          // Deform
          ctx.strokeStyle = `rgba(255, 255, 255, 0.8)`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          for(let i=0; i<=bufferLength; i++) {
              const angle = (i / bufferLength) * Math.PI * 2;
              const boost = (dataArray[i] / 255) * 50;
              const r = radius + boost;
              const x = cx + Math.cos(angle) * r;
              const y = cy + Math.sin(angle) * r;
              if (i===0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();

      } else if (style === 'matrix') {
          analyser.getByteFrequencyData(dataArray);
          ctx.fillStyle = '#0F0';
          ctx.font = '15px monospace';
          
          for(let i=0; i<dropsRef.current.length; i++) {
              const text = String.fromCharCode(0x30A0 + Math.random() * 96);
              
              // Modulate opacity/brightness by frequency
              const freqIndex = Math.floor((i / dropsRef.current.length) * bufferLength);
              const freq = dataArray[freqIndex] || 0;
              const alpha = (freq / 255) + 0.1;
              
              ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${alpha})`;
              ctx.fillText(text, i * 20, dropsRef.current[i]);
              
              // Reset drop if it hits bottom
              if(dropsRef.current[i] > h && Math.random() > 0.975) {
                  dropsRef.current[i] = 0;
              }
              
              dropsRef.current[i] += 20;
          }

      } else if (style === 'grid') {
          analyser.getByteFrequencyData(dataArray);
          const size = 40;
          const rows = Math.ceil(h / size) + 1;
          const cols = Math.ceil(w / size) + 1;
          const bass = dataArray[0] / 255;
          
          ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, 0.3)`;
          ctx.lineWidth = 1;
          
          // Perspective grid effect
          for(let y=0; y<rows; y++) {
             for(let x=0; x<cols; x++) {
                 const xPos = x * size;
                 const yPos = y * size;
                 const zOffset = (bass * 10) * Math.sin((x + y + Date.now()/100) * 0.5);
                 
                 const pX = xPos + zOffset;
                 const pY = yPos + zOffset;
                 
                 ctx.beginPath();
                 ctx.rect(pX, pY, size*0.8, size*0.8);
                 ctx.stroke();
             }
          }
      } else {
          /* Fallback drawing logic for other styles */
          analyser.getByteFrequencyData(dataArray);
          const barWidth = (w / bufferLength) * 2.5;
          let barX = 0;
          ctx.fillStyle = `rgb(${ar}, ${ag}, ${ab})`;
          for(let i = 0; i < bufferLength; i++) {
              const barHeight = (dataArray[i] / 255) * h;
              ctx.fillRect(barX, h - barHeight, barWidth, barHeight);
              barX += barWidth + 1;
          }
      }
    };

    draw();
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [analyser, colors, style, customConfig]);

  if (style === 'none') return null;
  return <canvas ref={canvasRef} className={`visualizer-canvas ${className}`} style={{ width: '100%', height: '100%' }} />;
};
