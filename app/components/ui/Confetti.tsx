'use client';

import ReactConfetti from 'react-confetti';

const FRAME_SIZE = 25;
const COLS = 5;
const TOTAL_FRAMES = 30;
const DRAW_SIZE = 25;
const HALF = DRAW_SIZE / 2;
const FPS = 24;
const FRAME_DURATION_MS = 1000 / FPS;

// 6 variants: 3 colors × 2 directions, matching the demo page
const VARIANTS = [
  { src: '/stud-sprite-blue.png', rotateDuration: 1, direction: 1 },
  { src: '/stud-sprite-red.png', rotateDuration: 2, direction: 1 },
  { src: '/stud-sprite-yellow.png', rotateDuration: 3, direction: 1 },
  { src: '/stud-sprite-blue.png', rotateDuration: 1, direction: -1 },
  { src: '/stud-sprite-red.png', rotateDuration: 2, direction: -1 },
  { src: '/stud-sprite-yellow.png', rotateDuration: 3, direction: -1 },
] as const;

// Preload all sprite sheets
const spriteImages: HTMLImageElement[] = [];
if (typeof window !== 'undefined') {
  const srcs = new Set(VARIANTS.map(v => v.src));
  const cache = new Map<string, HTMLImageElement>();
  for (const src of srcs) {
    const img = new Image();
    img.src = src;
    cache.set(src, img);
  }
  for (const v of VARIANTS) {
    spriteImages.push(cache.get(v.src)!);
  }
}

type ParticleState = {
  spriteFrame: number;
  lastFrameTime: number;
  startTime: number;
};

// WeakMap keyed on the particle object itself — stable identity, no cleanup needed
const particleState = new WeakMap<object, ParticleState>();

type ConfettiProps = {
  onDone: () => void;
  /** Y position (px) where particles spawn */
  sourceY: number;
};

export function Confetti({ onDone, sourceY }: ConfettiProps) {
  return (
    <ReactConfetti
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 110,
        pointerEvents: 'none',
      }}
      width={window.innerWidth}
      height={window.innerHeight}
      confettiSource={{ x: 0, y: sourceY, w: window.innerWidth, h: 0 }}
      recycle={false}
      numberOfPieces={320}
      gravity={0.2}
      initialVelocityY={20}
      colors={VARIANTS.map((_, i) => String(i))}
      drawShape={function (
        this: object & { color: string; angle: number; rotateY: number },
        ctx
      ) {
        const variantIndex = Number(this.color);
        const variant = VARIANTS[variantIndex];
        const img = spriteImages[variantIndex];
        if (!variant || !img?.complete) return;

        const now = performance.now();
        let state = particleState.get(this);
        if (!state) {
          state = { spriteFrame: 0, lastFrameTime: now, startTime: now };
          particleState.set(this, state);
        }

        // Advance sprite frame at FPS rate
        if (now - state.lastFrameTime >= FRAME_DURATION_MS) {
          const steps = Math.floor(
            (now - state.lastFrameTime) / FRAME_DURATION_MS
          );
          state.spriteFrame = (state.spriteFrame + steps) % TOTAL_FRAMES;
          state.lastFrameTime += steps * FRAME_DURATION_MS;
        }

        const col = state.spriteFrame % COLS;
        const row = Math.floor(state.spriteFrame / COLS);
        const sx = col * FRAME_SIZE;
        const sy = row * FRAME_SIZE;

        // Undo react-confetti's transforms: rotate(angle) → scale(1, rotateY) → rotate(angle)
        // Reset back to just translate(x, y), then apply our own rotation
        ctx.rotate(-this.angle);
        ctx.scale(1, 1 / (this.rotateY || 1));
        ctx.rotate(-this.angle);

        // Apply steady rotation matching the demo: duration in seconds, CW or CCW
        const elapsed = now - state.startTime;
        const rotationAngle =
          variant.direction *
          (elapsed / (variant.rotateDuration * 1000)) *
          2 *
          Math.PI;
        ctx.rotate(rotationAngle);

        ctx.drawImage(
          img,
          sx,
          sy,
          FRAME_SIZE,
          FRAME_SIZE,
          -HALF,
          -HALF,
          DRAW_SIZE,
          DRAW_SIZE
        );
      }}
      onConfettiComplete={() => onDone()}
    />
  );
}
