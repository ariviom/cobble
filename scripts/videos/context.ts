import type { Page, Locator } from 'playwright';
import { typeNaturally, centerOf } from './helpers';
import type { ZoomKeyframe } from './zoom';

export type { ZoomKeyframe };

// ---------------------------------------------------------------------------
// Timing / zoom config types
// ---------------------------------------------------------------------------

export interface BaseTiming {
  initialPause: number;
  zoomTransition: number;
  panTransition: number;
  typingBase: [number, number];
  typingPauseChance: number;
}

export interface BaseZoom {
  modalFraming: number;
  modalCenterOffset: number;
}

export interface ScenarioConfig<
  T extends BaseTiming = BaseTiming,
  Z extends BaseZoom = BaseZoom,
> {
  name: string;
  description: string;
  warmStart: boolean;
  timing: T;
  zoom: Z;
}

// ---------------------------------------------------------------------------
// Scenario context
// ---------------------------------------------------------------------------

export interface ScenarioContext<C extends ScenarioConfig = ScenarioConfig> {
  page: Page;
  baseUrl: string;
  config: C;
  viewport: { width: number; height: number };
  viewportCenter: { x: number; y: number };
  mark(zoom: number, center?: { x: number; y: number }): void;
  typeNaturally(text: string): Promise<void>;
  centerOf(locator: Locator): Promise<{ x: number; y: number }>;
  wait(ms: number): Promise<void>;
  elapsed(): number;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface RunResult {
  trimStart: number;
}

export interface ScenarioResult {
  trimStart: number;
  zoomKeyframes: ZoomKeyframe[];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createContext<C extends ScenarioConfig>(
  page: Page,
  baseUrl: string,
  config: C,
  zoomKeyframes: ZoomKeyframe[] = []
): ScenarioContext<C> {
  const t0 = Date.now();

  const vp = page.viewportSize();
  if (!vp) throw new Error('No viewport size available');

  return {
    page,
    baseUrl,
    config,
    viewport: { width: vp.width, height: vp.height },
    viewportCenter: { x: vp.width / 2, y: vp.height / 2 },

    mark(zoom: number, center?: { x: number; y: number }) {
      zoomKeyframes.push({ time: (Date.now() - t0) / 1000, zoom, center });
    },

    typeNaturally(text: string) {
      return typeNaturally(page, text, config.timing);
    },

    centerOf(locator: Locator) {
      return centerOf(locator);
    },

    wait(ms: number) {
      return page.waitForTimeout(ms);
    },

    elapsed() {
      return (Date.now() - t0) / 1000;
    },
  };
}
