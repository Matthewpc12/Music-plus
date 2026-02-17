
import React, { useEffect, useRef, useState } from 'react';
import { CustomVisualizerConfig, VisualizerElement } from '../types';

export type VisualizerStyle = 'normal' | 'glow' | 'bars' | 'retro' | 'pixel' | 'lcd' | 'wave' | 'spectrum' | 'dna' | 'orb' | 'matrix' | 'grid' | 'vinyl' | 'starfield' | 'custom' | 'none';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  coverUrl?: string;
  className?: string;
  style?: VisualizerStyle;
  customConfig?: CustomVisualizerConfig;
}

export const Visualizer: React.FC<VisualizerProps> = ({ analyser, coverUrl, className, style = 'normal', customConfig }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const [colors, setColors] = useState({ bg: [10, 10, 10], accent: [250, 45, 72] });
  const imgRef = useRef<HTMLImageElement | null>(null);
  
  const dropsRef = useRef<number[]>([]);
  const rotationRef = useRef(0);
  const starsRef = useRef<{x: number, y: number, z: number}[]>([]);

  useEffect(() => {
    if (!coverUrl) return;
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = coverUrl;
    img.onload = () => {
      imgRef.current = img;
      const canvas = document.createElement('canvas');
      canvas.width = 1; canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      try {
        ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        setColors({ bg: [r, g, b], accent: [r, g, b] });
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
    const width = rect.width;
    const height = rect.height;
    
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const timeArray = new Uint8Array(bufferLength);

    // Init persistent states
    if (style === 'matrix' && dropsRef.current.length === 0) {
        dropsRef.current = new Array(Math.ceil(width / 20)).fill(0).map(() => Math.random() * height);
    }
    if (style === 'starfield' && starsRef.current.length === 0) {
        starsRef.current = new Array(200).fill(0).map(() => ({
            x: (Math.random() - 0.5) * width,
            y: (Math.random() - 0.5) * height,
            z: Math.random() * width
        }));
    }

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      const w = width;
      const h = height;
      if (w === 0 || h === 0) return;

      const cx = w / 2;
      const cy = h / 2;

      analyser.getByteFrequencyData(dataArray);
      analyser.getByteTimeDomainData(timeArray);

      // Simple frequency averages
      let bass = 0, mid = 0, treble = 0;
      for (let i = 0; i < 10; i++) bass += dataArray[i];
      for (let i = 10; i < 50; i++) mid += dataArray[i];
      for (let i = 50; i < 100; i++) treble += dataArray[i];
      bass = bass / 10 / 255;
      mid = mid / 40 / 255;
      treble = treble / 50 / 255;

      const [ar, ag, ab] = colors.accent;
      const [br, bg, bb] = colors.bg;

      if (style === 'custom' && customConfig) {
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
                  ctx.beginPath(); ctx.arc(0, 0, el.size / 2, 0, Math.PI * 2); ctx.fill();
              } else if (el.type === 'rect') {
                  ctx.fillRect(-el.width / 2, -el.height / 2, el.width, el.height);
              } else if (el.type === 'line') {
                  ctx.beginPath(); ctx.moveTo(-el.width / 2, 0); ctx.lineTo(el.width / 2, 0); ctx.stroke();
              } else if (el.type === 'star') {
                  const spikes = 5; const outerRadius = el.size / 2; const innerRadius = el.size / 4;
                  let rot = Math.PI / 2 * 3; let x = 0; let y = 0; let step = Math.PI / spikes;
                  ctx.beginPath(); ctx.moveTo(0, -outerRadius);
                  for (let i = 0; i < spikes; i++) {
                      x = Math.cos(rot) * outerRadius; y = Math.sin(rot) * outerRadius; ctx.lineTo(x, y); rot += step;
                      x = Math.cos(rot) * innerRadius; y = Math.sin(rot) * innerRadius; ctx.lineTo(x, y); rot += step;
                  }
                  ctx.lineTo(0, -outerRadius); ctx.closePath(); ctx.fill();
              }
              ctx.restore();
          });
          return;
      }

      // Clearing with style logic
      if (['retro', 'matrix', 'starfield', 'vinyl'].includes(style)) {
          if (style === 'retro') ctx.fillStyle = 'rgba(0, 20, 0, 1)';
          else if (style === 'matrix') ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
          else ctx.fillStyle = 'black';
          ctx.fillRect(0, 0, w, h);
      } else {
          ctx.clearRect(0, 0, w, h);
      }

      if (style === 'normal') {
          const volumeRatio = (bass + mid + treble) / 3;
          const pulse = 1 + (volumeRatio * 0.5);
          const r = w * 0.9 * pulse;
          const bgGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
          bgGradient.addColorStop(0, `rgba(${br}, ${bg}, ${bb}, 0.4)`);
          bgGradient.addColorStop(1, `rgba(0,0,0,0)`);
          ctx.fillStyle = bgGradient;
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${0.2 + volumeRatio})`;
          ctx.lineWidth = 2 + volumeRatio * 10;
          ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, 50 + volumeRatio * 200), 0, Math.PI * 2); ctx.stroke();
          const barsToDraw = 64; const barWidth = (w / (barsToDraw * 1.5));
          for (let i = 0; i < barsToDraw; i++) {
            const idx = i * Math.floor(bufferLength / barsToDraw);
            const val = dataArray[idx] || 0;
            const barHeight = (val / 255) * h * 0.45 * (1 + volumeRatio);
            const xOffset = i * (barWidth + 4);
            const barGrad = ctx.createLinearGradient(0, cy - barHeight/2, 0, cy + barHeight/2);
            barGrad.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 0)`);
            barGrad.addColorStop(0.5, `rgba(${ar + 50}, ${ag + 50}, ${ab + 50}, 0.9)`);
            barGrad.addColorStop(1, `rgba(${ar}, ${ag}, ${ab}, 0)`);
            ctx.fillStyle = barGrad;
            ctx.fillRect(cx + xOffset, cy - barHeight/2, barWidth, barHeight);
            ctx.fillRect(cx - xOffset - barWidth, cy - barHeight/2, barWidth, barHeight);
          }
      } else if (style === 'glow') {
          ctx.globalCompositeOperation = 'screen';
          const bars = 32; const angleStep = (Math.PI * 2) / bars; const radius = 120;
          for(let i=0; i<bars; i++) {
              const val = dataArray[i * 4] || 0; const len = (val / 255) * 150;
              const x = cx + Math.cos(i * angleStep) * radius; const y = cy + Math.sin(i * angleStep) * radius;
              const endX = cx + Math.cos(i * angleStep) * (radius + len); const endY = cy + Math.sin(i * angleStep) * (radius + len);
              ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, 0.6)`; ctx.lineWidth = 12; ctx.lineCap = 'round';
              ctx.shadowBlur = 25; ctx.shadowColor = `rgba(${ar}, ${ag}, ${ab}, 1)`;
              ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(endX, endY); ctx.stroke();
          }
          ctx.globalCompositeOperation = 'source-over';
          ctx.shadowBlur = 0;
      } else if (style === 'retro') {
          ctx.lineWidth = 2; ctx.strokeStyle = '#00ff00'; ctx.shadowBlur = 8; ctx.shadowColor = '#00ff00';
          ctx.beginPath(); const sliceWidth = w / bufferLength; let rx = 0;
          for(let i = 0; i < bufferLength; i++) {
              const v = timeArray[i] / 128.0; const ry = v * h/2;
              if(i === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
              rx += sliceWidth;
          }
          ctx.stroke();
          ctx.strokeStyle = 'rgba(0, 255, 0, 0.05)'; ctx.lineWidth = 1; ctx.beginPath();
          for(let y=0; y<h; y+=40) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
          for(let gx=0; gx<w; gx+=40) { ctx.moveTo(gx, 0); ctx.lineTo(gx, h); }
          ctx.stroke();
          ctx.shadowBlur = 0;
      } else if (style === 'pixel') {
          const cols = 16; const rows = 12; const cw = w / cols; const ch = h / rows;
          for(let i=0; i<cols; i++) {
              const val = dataArray[i * 6] || 0; const active = Math.floor((val / 255) * rows);
              for(let j=0; j<active; j++) {
                   const py = h - ((j+1) * ch); ctx.fillStyle = `rgb(${ar}, ${ag}, ${ab})`;
                   ctx.fillRect(i * cw + 2, py + 2, cw - 4, ch - 4);
              }
          }
      } else if (style === 'matrix') {
          ctx.font = '15px monospace';
          for(let i=0; i<dropsRef.current.length; i++) {
              const text = String.fromCharCode(0x30A0 + Math.random() * 96);
              const freq = dataArray[i * 2] || 0; const alpha = (freq / 255) + 0.1;
              ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${alpha})`;
              ctx.fillText(text, i * 20, dropsRef.current[i]);
              if(dropsRef.current[i] > h && Math.random() > 0.975) dropsRef.current[i] = 0;
              dropsRef.current[i] += 20;
          }
      } else if (style === 'dna') {
          for(let i=0; i<bufferLength; i+=6) {
              const v = (timeArray[i] / 128.0) * 80; const dy = (i / bufferLength) * h;
              const x1 = cx + Math.sin(dy * 0.05 + Date.now() * 0.002) * v;
              const x2 = cx - Math.sin(dy * 0.05 + Date.now() * 0.002) * v;
              ctx.fillStyle = `rgb(${ar}, ${ag}, ${ab})`; ctx.beginPath(); ctx.arc(x1, dy, 5, 0, Math.PI * 2); ctx.fill();
              ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, 0.5)`; ctx.beginPath(); ctx.arc(x2, dy, 5, 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, 0.1)`; ctx.beginPath(); ctx.moveTo(x1, dy); ctx.lineTo(x2, dy); ctx.stroke();
          }
      } else if (style === 'orb') {
          const radius = 100 + (bass * 60);
          const grad = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.5);
          grad.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 1)`);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath();
          for(let i=0; i<=bufferLength; i++) {
              const angle = (i / bufferLength) * Math.PI * 2; const boost = (dataArray[i % bufferLength] / 255) * 60;
              const ox = cx + Math.cos(angle) * (radius + boost); const oy = cy + Math.sin(angle) * (radius + boost);
              if (i===0) ctx.moveTo(ox, oy); else ctx.lineTo(ox, oy);
          }
          ctx.closePath(); ctx.stroke();
      } else if (style === 'starfield') {
          starsRef.current.forEach(star => {
              star.z -= 2 + (bass * 20);
              if (star.z <= 0) star.z = w;
              const sx = (star.x / star.z) * w + cx; const sy = (star.y / star.z) * h + cy;
              const sr = (1 - star.z / w) * 5;
              ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${1 - star.z / w})`;
              ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.1, sr), 0, Math.PI * 2); ctx.fill();
          });
      } else {
          // Fallback Spectrum/Bars
          const barWidth = (w / 40);
          for(let i=0; i<40; i++) {
              const val = dataArray[i * 4] || 0;
              const bh = (val / 255) * h * 0.8;
              ctx.fillStyle = `rgb(${ar}, ${ag}, ${ab})`;
              ctx.fillRect(i * barWidth, h - bh, barWidth - 2, bh);
          }
      }
    };

    draw();
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [analyser, colors, style, customConfig]);

  if (style === 'none') return null;
  return <canvas ref={canvasRef} className={className} style={{ width: '100%', height: '100%' }} />;
};
