export function getBricklinkSetUrl(setNumber: string): string {
  return `https://www.bricklink.com/v2/catalog/catalogitem.page?S=${encodeURIComponent(setNumber)}`;
}

export function getRebrickableSetUrl(setNumber: string): string {
  return `https://rebrickable.com/sets/${encodeURIComponent(setNumber)}/`;
}
