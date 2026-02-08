import 'server-only';

export type BLAvailableColor = { id: number; name: string };

export type BLSet = {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  quantity: number;
  numParts?: number | null;
  themeId?: number | null;
  themeName?: string | null;
};

export type BLSource =
  | 'bl_supersets'
  | 'bl_components'
  | 'bl_subsets_intersection';

export type BLFallbackResult = {
  sets: BLSet[];
  partName: string;
  partImage: string | null;
  blAvailableColors: BLAvailableColor[];
  source: BLSource;
};
