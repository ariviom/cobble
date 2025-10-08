// Minimal color map to start; extend as needed.
// Keys are Rebrickable color IDs; values are BrickLink color IDs.
const REBRICKABLE_TO_BRICKLINK_COLOR: Record<number, number> = {
    // Common examples; expand over time
    0: 0, // Black
    1: 15, // Blue → BrickLink Blue
    2: 85, // Green → Dark Green
    3: 5, // Red
    4: 7, // Yellow
    6: 8, // Brown
    7: 1, // Gray → Light Gray (legacy; may need modern mapping)
    8: 72, // Dark Gray (legacy; may need modern mapping)
    15: 11, // White
    28: 2, // Blue-ish gray mapping example; verify
};

export function mapToBrickLink(partId: string, colorId: number): { itemNo: string; colorId: number } | null {
    const blColor = REBRICKABLE_TO_BRICKLINK_COLOR[colorId];
    if (blColor == null) return null;
    // Assume part numbers map 1:1 initially
    return { itemNo: partId, colorId: blColor };
}


