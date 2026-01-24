/**
 * BrickLink Color ID to Color Name Mapping
 *
 * Static mapping of BrickLink color IDs to human-readable color names.
 * This is faster than looking up via Rebrickable API and works offline.
 *
 * Source: https://www.bricklink.com/catalogColors.asp
 */

export const BRICKLINK_COLORS: Record<number, string> = {
  // Solid Colors
  1: 'White',
  49: 'Very Light Gray',
  99: 'Very Light Bluish Gray',
  86: 'Light Bluish Gray',
  9: 'Light Gray',
  10: 'Dark Gray',
  85: 'Dark Bluish Gray',
  11: 'Black',
  59: 'Dark Red',
  5: 'Red',
  167: 'Reddish Orange',
  231: 'Dark Salmon',
  25: 'Salmon',
  220: 'Coral',
  26: 'Light Salmon',
  58: 'Sand Red',
  120: 'Dark Brown',
  168: 'Umber',
  8: 'Brown',
  88: 'Reddish Brown',
  91: 'Light Brown',
  240: 'Medium Brown',
  106: 'Fabuland Brown',
  69: 'Dark Tan',
  2: 'Tan',
  90: 'Light Nougat',
  241: 'Medium Tan',
  28: 'Nougat',
  150: 'Medium Nougat',
  225: 'Dark Nougat',
  169: 'Sienna',
  160: 'Fabuland Orange',
  29: 'Earth Orange',
  68: 'Dark Orange',
  27: 'Rust',
  165: 'Neon Orange',
  4: 'Orange',
  31: 'Medium Orange',
  32: 'Light Orange',
  110: 'Bright Light Orange',
  172: 'Warm Yellowish Orange',
  96: 'Very Light Orange',
  161: 'Dark Yellow',
  173: 'Ochre Yellow',
  3: 'Yellow',
  33: 'Light Yellow',
  103: 'Bright Light Yellow',
  236: 'Neon Yellow',
  171: 'Lemon',
  166: 'Neon Green',
  35: 'Light Lime',
  158: 'Yellowish Green',
  76: 'Medium Lime',
  34: 'Lime',
  248: 'Fabuland Lime',
  155: 'Olive Green',
  242: 'Dark Olive Green',
  80: 'Dark Green',
  6: 'Green',
  36: 'Bright Green',
  37: 'Medium Green',
  38: 'Light Green',
  48: 'Sand Green',
  39: 'Dark Turquoise',
  40: 'Light Turquoise',
  41: 'Aqua',
  152: 'Light Aqua',
  63: 'Dark Blue',
  7: 'Blue',
  153: 'Dark Azure',
  247: 'Little Robots Blue',
  72: 'Maersk Blue',
  156: 'Medium Azure',
  87: 'Sky Blue',
  42: 'Medium Blue',
  105: 'Bright Light Blue',
  62: 'Light Blue',
  55: 'Sand Blue',
  109: 'Dark Royal Blue',
  43: 'Violet',
  97: 'Royal Blue',
  245: 'Lilac',
  174: 'Blue Violet',
  73: 'Medium Violet',
  246: 'Light Lilac',
  44: 'Light Violet',
  89: 'Dark Purple',
  24: 'Purple',
  93: 'Light Purple',
  157: 'Medium Lavender',
  154: 'Lavender',
  227: 'Clikits Lavender',
  54: 'Sand Purple',
  71: 'Magenta',
  47: 'Dark Pink',
  94: 'Medium Dark Pink',
  104: 'Bright Pink',
  23: 'Pink',
  56: 'Rose Pink',
  175: 'Warm Pink',

  // Transparent Colors
  12: 'Trans-Clear',
  13: 'Trans-Brown',
  251: 'Trans-Black',
  17: 'Trans-Red',
  18: 'Trans-Neon Orange',
  98: 'Trans-Orange',
  164: 'Trans-Light Orange',
  121: 'Trans-Neon Yellow',
  19: 'Trans-Yellow',
  16: 'Trans-Neon Green',
  108: 'Trans-Bright Green',
  221: 'Trans-Light Green',
  226: 'Trans-Light Bright Green',
  20: 'Trans-Green',
  14: 'Trans-Dark Blue',
  74: 'Trans-Medium Blue',
  15: 'Trans-Light Blue',
  113: 'Trans-Aqua',
  114: 'Trans-Light Purple',
  234: 'Trans-Medium Purple',
  51: 'Trans-Purple',
  50: 'Trans-Dark Pink',
  107: 'Trans-Pink',

  // Chrome Colors
  21: 'Chrome Gold',
  22: 'Chrome Silver',
  57: 'Chrome Antique Brass',
  122: 'Chrome Black',
  52: 'Chrome Blue',
  64: 'Chrome Green',
  82: 'Chrome Pink',

  // Pearl Colors
  83: 'Pearl White',
  119: 'Pearl Very Light Gray',
  66: 'Pearl Light Gray',
  95: 'Flat Silver',
  239: 'Bionicle Silver',
  77: 'Pearl Dark Gray',
  244: 'Pearl Black',
  61: 'Pearl Light Gold',
  115: 'Pearl Gold',
  235: 'Reddish Gold',
  238: 'Bionicle Gold',
  81: 'Flat Dark Gold',
  249: 'Reddish Copper',
  84: 'Copper',
  237: 'Bionicle Copper',
  255: 'Pearl Brown',
  252: 'Pearl Red',
  253: 'Pearl Green',
  254: 'Pearl Blue',
  78: 'Pearl Sand Blue',
  243: 'Pearl Sand Purple',

  // Satin Colors
  228: 'Satin Trans-Clear',
  229: 'Satin Trans-Brown',
  170: 'Satin Trans-Yellow',
  233: 'Satin Trans-Bright Green',
  223: 'Satin Trans-Light Blue',
  232: 'Satin Trans-Dark Blue',
  230: 'Satin Trans-Purple',
  224: 'Satin Trans-Dark Pink',

  // Metallic Colors
  67: 'Metallic Silver',
  70: 'Metallic Green',
  65: 'Metallic Gold',
  250: 'Metallic Copper',

  // Milky Colors
  60: 'Milky White',
  159: 'Glow In Dark White',
  46: 'Glow In Dark Opaque',
  118: 'Glow In Dark Trans',

  // Glitter Colors
  101: 'Glitter Trans-Clear',
  222: 'Glitter Trans-Orange',
  163: 'Glitter Trans-Neon Green',
  162: 'Glitter Trans-Light Blue',
  102: 'Glitter Trans-Purple',
  100: 'Glitter Trans-Dark Pink',

  // Speckle Colors
  111: 'Speckle Black-Silver',
  151: 'Speckle Black-Gold',
  116: 'Speckle Black-Copper',
  117: 'Speckle DBGray-Silver',

  // Modulex Colors
  123: 'Mx White',
  124: 'Mx Light Bluish Gray',
  125: 'Mx Light Gray',
  211: 'Mx Foil Light Gray',
  127: 'Mx Tile Gray',
  126: 'Mx Charcoal Gray',
  210: 'Mx Foil Dark Gray',
  128: 'Mx Black',
  217: 'Mx Foil Red',
  129: 'Mx Red',
  130: 'Mx Pink Red',
  131: 'Mx Tile Brown',
  134: 'Mx Terracotta',
  132: 'Mx Brown',
  133: 'Mx Buff',
  135: 'Mx Orange',
  136: 'Mx Light Orange',
  219: 'Mx Foil Orange',
  137: 'Mx Light Yellow',
  218: 'Mx Foil Yellow',
  138: 'Mx Ochre Yellow',
  139: 'Mx Lemon',
  140: 'Mx Olive Green',
  212: 'Mx Foil Dark Green',
  141: 'Mx Pastel Green',
  213: 'Mx Foil Light Green',
  142: 'Mx Aqua Green',
  146: 'Mx Teal Blue',
  143: 'Mx Tile Blue',
  214: 'Mx Foil Dark Blue',
  144: 'Mx Medium Blue',
  215: 'Mx Foil Light Blue',
  145: 'Mx Pastel Blue',
  216: 'Mx Foil Violet',
  147: 'Mx Violet',
  148: 'Mx Pink',
  149: 'Mx Clear',
};

/**
 * Get color name from BrickLink color ID.
 * Returns the color name or null if not found.
 * Note: Coerces ID to number to handle potential string inputs.
 */
export function getBricklinkColorName(colorId: number): string | null {
  return BRICKLINK_COLORS[Number(colorId)] ?? null;
}

/**
 * Get color names for multiple BrickLink color IDs.
 * Returns a Map of colorId -> colorName for all found colors.
 * Note: Coerces IDs to numbers to handle potential string/number type mismatches
 * from database or API responses.
 */
export function getBricklinkColorNames(
  colorIds: number[]
): Map<number, string> {
  const result = new Map<number, string>();
  for (const id of colorIds) {
    // Coerce to number to handle potential string inputs from DB/API
    const numId = Number(id);
    const name = BRICKLINK_COLORS[numId];
    if (name) {
      result.set(numId, name);
    }
  }
  return result;
}
