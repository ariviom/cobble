/**
 * Post-processing zoom via FFmpeg zoompan filter.
 *
 * Uses reverse-engineered "effective centers" so that:
 * - Zoom transitions go straight into/out of the target (no arc)
 * - Pan transitions at the same zoom level move diagonally
 *
 * The x,y are derived from z and the effective center at runtime,
 * which ties position to zoom level and eliminates drift.
 */

export interface ZoomKeyframe {
  /** Seconds from scenario start */
  time: number;
  /** Zoom level: 1 = full view, >1 = zoomed in */
  zoom: number;
  /** Center point in CSS viewport pixels (required when zoom > 1) */
  center?: { x: number; y: number };
}

/**
 * Build an FFmpeg zoompan filter string from zoom keyframes.
 * Returns null if no meaningful zoom transitions exist.
 */
export function buildZoompanFilter(
  keyframes: ZoomKeyframe[],
  scenarioTrimSec: number,
  recordW: number,
  recordH: number,
  outputW: number,
  outputH: number,
  scaleFactor: number,
  fps: number
): string | null {
  if (keyframes.length < 2) return null;

  const adjusted = keyframes
    .map(kf => ({ ...kf, time: kf.time - scenarioTrimSec }))
    .filter(kf => kf.time >= -0.1)
    .map(kf => (kf.time < 0 ? { ...kf, time: 0 } : kf));

  const points = adjusted.map(kf => {
    const frame = Math.round(kf.time * fps);

    if (kf.zoom <= 1 || !kf.center) {
      // Full view: effective center = frame center
      return { frame, z: 1, ecx: recordW / 2, ecy: recordH / 2 };
    }

    const z = kf.zoom;
    const cropW = recordW / z;
    const cropH = recordH / z;
    const cx = kf.center.x * scaleFactor;
    const cy = kf.center.y * scaleFactor;

    // Clamp crop position to frame bounds
    const x = Math.max(0, Math.min(recordW - cropW, cx - cropW / 2));
    const y = Math.max(0, Math.min(recordH - cropH, cy - cropH / 2));

    // Reverse-engineer effective center from clamped position.
    // When fed back through the derive formula at this z, it reproduces
    // exactly x,y. When interpolated with other effective centers and
    // derived at intermediate z values, the zoom goes straight to target.
    const ecx = x + recordW / (2 * z);
    const ecy = y + recordH / (2 * z);

    return { frame, z, ecx: Math.round(ecx), ecy: Math.round(ecy) };
  });

  if (points.every(p => p.z === 1)) return null;

  const zExpr = buildSmoothExpr(
    points.map(p => ({ frame: p.frame, value: p.z }))
  );
  const cxExpr = buildSmoothExpr(
    points.map(p => ({ frame: p.frame, value: p.ecx }))
  );
  const cyExpr = buildSmoothExpr(
    points.map(p => ({ frame: p.frame, value: p.ecy }))
  );

  // Derive x,y from z and effective center — straight zoom, diagonal pan
  const xExpr = `max(0,min(iw-iw/zoom,(${cxExpr})-iw/(2*zoom)))`;
  const yExpr = `max(0,min(ih-ih/zoom,(${cyExpr})-ih/(2*zoom)))`;

  return `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${outputW}x${outputH}`;
}

// ---------------------------------------------------------------------------
// Expression builder
// ---------------------------------------------------------------------------

/**
 * Build a piecewise FFmpeg expression with smoothstep (ease-in-out)
 * interpolation. Uses the `on` variable (output frame number).
 */
function buildSmoothExpr(
  points: Array<{ frame: number; value: number }>
): string {
  if (points.length === 0) return '1';
  if (points.length === 1) return fmt(points[0].value);

  let expr = fmt(points[points.length - 1].value);

  for (let i = points.length - 2; i >= 0; i--) {
    const curr = points[i];
    const next = points[i + 1];
    const df = next.frame - curr.frame;

    if (df <= 0) continue;

    if (Math.abs(curr.value - next.value) < 0.01) {
      expr = `if(lt(on,${next.frame}),${fmt(curr.value)},${expr})`;
    } else {
      const p = `(on-${curr.frame})/${df}`;
      const smooth = `(3*pow(${p},2)-2*pow(${p},3))`;
      const interp = `${fmt(curr.value)}+(${fmt(next.value - curr.value)})*${smooth}`;
      expr = `if(lt(on,${next.frame}),${interp},${expr})`;
    }
  }

  return expr;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
