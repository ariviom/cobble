export type ImageVariant =
  | 'inventoryThumb'
  | 'inventoryModal'
  | 'identifyResult'
  | 'identifyCandidate'
  | 'minifigCard'
  | 'minifigSearch'
  | 'setCard'
  | 'exclusivePieceThumb'
  | 'exclusiveSetThumb'
  | 'recentIdentifyThumb';

type ImageSizeConfig = {
  width: number;
  height: number;
  sizes: string;
};

const IMAGE_SIZES: Record<ImageVariant, ImageSizeConfig> = {
  inventoryThumb: {
    width: 160,
    height: 160,
    sizes:
      '(min-width:1280px) 160px, (min-width:1024px) 140px, (min-width:640px) 120px, 96px',
  },
  inventoryModal: {
    width: 400,
    height: 400,
    sizes:
      '(min-width:1280px) 400px, (min-width:1024px) 360px, (min-width:640px) 320px, 280px',
  },
  identifyResult: {
    width: 128,
    height: 128,
    sizes: '(min-width:768px) 128px, 96px',
  },
  identifyCandidate: {
    width: 160,
    height: 160,
    sizes:
      '(min-width:1280px) 176px, (min-width:1024px) 160px, (min-width:640px) 144px, 120px',
  },
  minifigCard: {
    width: 240,
    height: 240,
    sizes:
      '(min-width:1280px) 240px, (min-width:1024px) 220px, (min-width:640px) 200px, 160px',
  },
  minifigSearch: {
    width: 240,
    height: 240,
    sizes:
      '(min-width:1280px) 220px, (min-width:1024px) 200px, (min-width:640px) 180px, 150px',
  },
  setCard: {
    width: 512,
    height: 512,
    sizes:
      '(min-width:1280px) 320px, (min-width:1024px) 280px, (min-width:640px) 240px, 200px',
  },
  exclusivePieceThumb: {
    width: 96,
    height: 96,
    sizes: '48px',
  },
  exclusiveSetThumb: {
    width: 160,
    height: 160,
    sizes: '80px',
  },
  recentIdentifyThumb: {
    width: 128,
    height: 128,
    sizes: '112px',
  },
};

export function getImageSizeConfig(variant: ImageVariant): ImageSizeConfig {
  return IMAGE_SIZES[variant];
}
