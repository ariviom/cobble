/**
 * Generates friendly LEGO-themed usernames for new profiles.
 *
 * Format: {color}{piece}{4digits} — all lowercase.
 * Example: redbrick3842
 */

const COLORS = [
  'red',
  'blue',
  'yellow',
  'green',
  'white',
  'black',
  'orange',
  'brown',
  'tan',
  'gray',
  'pink',
  'purple',
  'lime',
  'azure',
  'teal',
  'olive',
] as const;

const PIECES = ['brick', 'hinge', 'plate', 'slope', 'wedge'] as const;

export type UsernameColor = (typeof COLORS)[number];
export type UsernamePiece = (typeof PIECES)[number];

export const USERNAME_COLORS: readonly UsernameColor[] = COLORS;
export const USERNAME_PIECES: readonly UsernamePiece[] = PIECES;

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

export function generateUsername(): string {
  const color = COLORS[randomInt(COLORS.length)];
  const piece = PIECES[randomInt(PIECES.length)];
  const suffix = String(randomInt(10000)).padStart(4, '0');
  return `${color}${piece}${suffix}`;
}
