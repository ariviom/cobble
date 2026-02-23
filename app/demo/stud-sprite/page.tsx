'use client';

import { useEffect, useRef } from 'react';

const FRAME_SIZE = 25;
const COLS = 5;
const TOTAL_FRAMES = 30;

const FPS = 24;

const STUDS = [
  {
    label: 'blue CW',
    src: '/stud-sprite-blue.png',
    rotateDuration: 1,
    direction: 'normal' as const,
  },
  {
    label: 'red CW',
    src: '/stud-sprite-red.png',
    rotateDuration: 2,
    direction: 'normal' as const,
  },
  {
    label: 'yellow CW',
    src: '/stud-sprite-yellow.png',
    rotateDuration: 3,
    direction: 'normal' as const,
  },
  {
    label: 'blue CCW',
    src: '/stud-sprite-blue.png',
    rotateDuration: 1,
    direction: 'reverse' as const,
  },
  {
    label: 'red CCW',
    src: '/stud-sprite-red.png',
    rotateDuration: 2,
    direction: 'reverse' as const,
  },
  {
    label: 'yellow CCW',
    src: '/stud-sprite-yellow.png',
    rotateDuration: 3,
    direction: 'reverse' as const,
  },
];

function SpriteCanvas({
  src,
  label,
  rotateDuration,
  direction,
}: {
  src: string;
  label: string;
  rotateDuration: number;
  direction: 'normal' | 'reverse';
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const img = new Image();
    img.src = src;

    let rafId: number;
    let frame = 0;
    let lastFrameTime = 0;
    const frameDuration = 1000 / FPS;

    const animate = (timestamp: number) => {
      if (timestamp - lastFrameTime >= frameDuration) {
        lastFrameTime = timestamp;
        frame = (frame + 1) % TOTAL_FRAMES;

        const col = frame % COLS;
        const row = Math.floor(frame / COLS);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(
          img,
          col * FRAME_SIZE,
          row * FRAME_SIZE,
          FRAME_SIZE,
          FRAME_SIZE,
          0,
          0,
          canvas.width,
          canvas.height
        );
      }

      rafId = requestAnimationFrame(animate);
    };

    img.onload = () => {
      rafId = requestAnimationFrame(animate);
    };

    return () => cancelAnimationFrame(rafId);
  }, [src]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <canvas
        ref={canvasRef}
        width={25}
        height={25}
        style={{
          width: 25,
          height: 25,
          imageRendering: 'pixelated',
          animation: `spin ${rotateDuration}s linear infinite ${direction}`,
        }}
      />
      <span style={{ fontFamily: 'monospace', fontSize: 14 }}>{label}</span>
      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#888' }}>
        {rotateDuration}s CSS rotation
      </span>
    </div>
  );
}

export default function StudSpriteDemo() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 48,
        background: '#1a1a1a',
        color: '#fff',
      }}
    >
      { }
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <h1 style={{ fontFamily: 'monospace', fontSize: 24 }}>
        Stud Sprite Demo
      </h1>
      <div
        style={{
          display: 'flex',
          gap: 64,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {STUDS.map(stud => (
          <SpriteCanvas key={stud.label} {...stud} />
        ))}
      </div>
    </div>
  );
}
