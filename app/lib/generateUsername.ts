/**
 * Generates friendly LEGO-themed usernames for new profiles.
 *
 * Format: {firstWord}{secondWord}{4digits} — all lowercase.
 * Example: brickbuilder3842
 */

const SECOND_WORDS_ALL = [
  'builder',
  'sorter',
  'stacker',
  'collector',
  'maniac',
  'fan',
  'nerd',
  'vault',
  'stash',
  'haul',
  'finder',
] as const;

const SECOND_WORDS_NARROW = [
  'builder',
  'sorter',
  'stacker',
  'collector',
  'vault',
  'stash',
  'haul',
  'finder',
] as const;

/** First words that pair well with all second words. */
const UNIVERSAL_FIRST = ['brick', 'set'] as const;

/** First words that only pair with action/container second words. */
const NARROW_FIRST = ['stud', 'part', 'piece'] as const;

type Pair = [string, string];

function buildPairs(): Pair[] {
  const pairs: Pair[] = [];
  for (const first of UNIVERSAL_FIRST) {
    for (const second of SECOND_WORDS_ALL) {
      pairs.push([first, second]);
    }
  }
  for (const first of NARROW_FIRST) {
    for (const second of SECOND_WORDS_NARROW) {
      pairs.push([first, second]);
    }
  }
  return pairs;
}

const ALL_PAIRS = buildPairs();

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

export function generateUsername(): string {
  const [first, second] = ALL_PAIRS[randomInt(ALL_PAIRS.length)];
  const suffix = String(randomInt(10000)).padStart(4, '0');
  return `${first}${second}${suffix}`;
}
