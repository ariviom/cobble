/**
 * Video recording CLI — slim orchestrator that delegates to recorder.ts.
 *
 * Usage:
 *   npx tsx scripts/videos/record.ts <script-name> [options]
 *   npx tsx scripts/videos/record.ts --list
 *
 * Options:
 *   --list      List available scenarios and exit
 *   --viewport  desktop | mobile | all   (default: desktop)
 *   --theme     light | dark | all       (default: light)
 *   --color     blue | yellow | purple | red | green | all  (default: yellow)
 *   --url       Base URL (default: https://brick-party.com)
 *   --serial    Run variants one at a time (default: parallel, max 4)
 *
 * Auth: Set VIDEO_AUTH_EMAIL and VIDEO_AUTH_PASSWORD in .env.local to
 * automatically sign in before each recording.
 *
 * Output: scripts/videos/output/<script>-<viewport>-<theme>-<color>.mp4
 */

import { config as loadEnv } from 'dotenv';
import { mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

loadEnv({ path: join(__dirname, '../../.env.local') });

import {
  recordVariant,
  VIEWPORTS,
  type Variant,
  type ScenarioModule,
} from './recorder';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OUTPUT_DIR = join(__dirname, 'output');
const DEFAULT_URL = 'https://brick-party.com';
const DEFAULT_CONCURRENCY = 4;

const THEMES = ['light', 'dark'] as const;
const COLORS = ['blue', 'yellow', 'purple', 'red', 'green'] as const;

type Theme = (typeof THEMES)[number];
type Color = (typeof COLORS)[number];

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

type ParsedArgs =
  | { list: true }
  | {
      list: false;
      scriptName: string;
      variants: Variant[];
      serial: boolean;
      baseUrl: string;
    };

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    return { list: true };
  }

  const scriptName = args.find(a => !a.startsWith('--'));
  if (!scriptName) {
    console.error(
      'Usage: npx tsx scripts/videos/record.ts <script-name> [--viewport desktop|mobile|all] [--theme light|dark|all] [--color blue|yellow|...|all] [--url <base-url>] [--serial] [--list]\n\nAuth: Set VIDEO_AUTH_EMAIL and VIDEO_AUTH_PASSWORD in .env.local'
    );
    process.exit(1);
  }

  const serial = args.includes('--serial');

  const urlIdx = args.indexOf('--url');
  const baseUrl = urlIdx >= 0 ? args[urlIdx + 1] : DEFAULT_URL;

  function flag(
    name: string,
    allowed: readonly string[],
    fallback: string
  ): string[] {
    const idx = args.indexOf(`--${name}`);
    const val = idx >= 0 ? args[idx + 1] : fallback;
    if (val === 'all') return [...allowed];
    if (!allowed.includes(val)) {
      console.error(
        `Invalid --${name} "${val}". Allowed: ${allowed.join(', ')}, all`
      );
      process.exit(1);
    }
    return [val];
  }

  const viewports = flag(
    'viewport',
    Object.keys(VIEWPORTS),
    'desktop'
  ) as Variant['viewport'][];
  const themes = flag(
    'theme',
    THEMES as unknown as string[],
    'light'
  ) as Theme[];
  const colors = flag(
    'color',
    COLORS as unknown as string[],
    'yellow'
  ) as Color[];

  // Build variant matrix
  const variants: Variant[] = [];
  for (const viewport of viewports) {
    for (const theme of themes) {
      for (const color of colors) {
        variants.push({ viewport, theme, color });
      }
    }
  }

  return { list: false, scriptName, variants, serial, baseUrl };
}

// ---------------------------------------------------------------------------
// Scenario loading
// ---------------------------------------------------------------------------

async function loadScenario(name: string): Promise<ScenarioModule> {
  let mod: Record<string, unknown>;
  try {
    mod = await import(`./scenarios/${name}`);
  } catch {
    console.error(`Scenario "${name}" not found in scenarios/ directory.`);
    process.exit(1);
  }

  if (
    !mod.config ||
    typeof mod.warmUp !== 'function' ||
    typeof mod.run !== 'function'
  ) {
    console.error(
      `Scenario "${name}" must export { config, warmUp, run }. Found: ${Object.keys(mod).join(', ')}`
    );
    process.exit(1);
  }

  return mod as unknown as ScenarioModule;
}

async function listScenarios(): Promise<void> {
  const scenariosDir = join(__dirname, 'scenarios');
  const files = readdirSync(scenariosDir).filter(f => f.endsWith('.ts'));

  console.log('Available scenarios:\n');
  for (const file of files) {
    const name = file.replace(/\.ts$/, '');
    try {
      const mod = await import(`./scenarios/${name}`);
      if (mod.config) {
        console.log(`  ${mod.config.name} — ${mod.config.description}`);
      } else {
        console.log(`  ${name} — (no config exported)`);
      }
    } catch {
      console.log(`  ${name} — (failed to load)`);
    }
  }
}

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  /** Stagger start of each worker by this many ms to avoid thundering herd. */
  staggerMs = 2000
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(workerIdx: number) {
    if (workerIdx > 0 && staggerMs > 0) {
      await new Promise(r => setTimeout(r, workerIdx * staggerMs));
    }
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    (_, i) => worker(i)
  );
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const parsed = parseArgs();

  if (parsed.list) {
    await listScenarios();
    return;
  }

  const { scriptName, variants, serial, baseUrl } = parsed;
  const scenario = await loadScenario(scriptName);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Clean previous outputs for this script
  for (const file of readdirSync(OUTPUT_DIR)) {
    if (file.startsWith(`${scriptName}-`) && file.endsWith('.mp4')) {
      unlinkSync(join(OUTPUT_DIR, file));
    }
  }

  const concurrency = serial ? 1 : DEFAULT_CONCURRENCY;

  console.log(
    `Recording "${scriptName}" — ${variants.length} variant${variants.length > 1 ? 's' : ''} (${serial ? 'serial' : `up to ${concurrency} parallel`}):`
  );
  for (const v of variants) {
    console.log(`  • ${v.viewport} / ${v.theme} / ${v.color}`);
  }
  console.log();

  const outputs = await mapWithConcurrency(variants, concurrency, variant =>
    recordVariant(scenario, scriptName, variant, baseUrl, OUTPUT_DIR)
  );

  console.log(
    `\nDone — ${outputs.length} video${outputs.length > 1 ? 's' : ''} saved.`
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
