import 'server-only';

// Barrel re-exports from pipeline stages.
// Preserves existing imports across the codebase (route handlers, tests).

export {
  resolveCandidates,
  type IdentifyCandidate,
  type ResolvedCandidate,
} from '@/app/lib/identify/stages/resolve';

export {
  resolveIdentifyResult,
  selectCandidateWithSets,
  needsEnrichment,
  enrichSetsIfNeeded,
  type IdentifyResolved,
} from '@/app/lib/identify/stages/findSets';
