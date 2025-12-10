// Backward-compat shim: explicitly re-export modular catalog implementation
export {
  getSetInventoryLocal,
  getSetMinifigsLocal,
  getSetSummaryLocal,
  getSetsForPartLocal,
  getThemesLocal,
  searchMinifigsLocal,
  searchSetsLocal,
  sortMinifigResults,
  type LocalSetMinifig,
  type MinifigCatalogResult,
} from './catalog/index';
