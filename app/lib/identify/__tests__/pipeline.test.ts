import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/app/lib/brickognize', () => ({
  identifyWithBrickognize: vi.fn(),
  extractCandidatePartNumbers: vi.fn(),
}));

vi.mock('@/app/lib/identify/stages/resolve', () => ({
  resolveCandidates: vi.fn(),
}));

vi.mock('@/app/lib/identify/stages/findSets', () => ({
  resolveIdentifyResult: vi.fn(),
}));

vi.mock('@/lib/metrics', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  identifyWithBrickognize,
  extractCandidatePartNumbers,
} from '@/app/lib/brickognize';
import { resolveCandidates } from '@/app/lib/identify/stages/resolve';
import { resolveIdentifyResult } from '@/app/lib/identify/stages/findSets';
import { PipelineBudget } from '../budget';
import { runIdentifyPipeline } from '../pipeline';

const mockIdentify = vi.mocked(identifyWithBrickognize);
const mockExtract = vi.mocked(extractCandidatePartNumbers);
const mockResolve = vi.mocked(resolveCandidates);
const mockFindSets = vi.mocked(resolveIdentifyResult);

describe('runIdentifyPipeline', () => {
  const fakeImage = new Blob(['test'], { type: 'image/png' });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns no_match when Brickognize yields no candidates', async () => {
    mockIdentify.mockResolvedValue({});
    mockExtract.mockReturnValue([]);

    const budget = new PipelineBudget(40);
    const result = await runIdentifyPipeline({ image: fakeImage }, budget);

    expect(result.status).toBe('no_match');
    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockFindSets).not.toHaveBeenCalled();
  });

  it('returns no_valid_candidate when resolve yields nothing', async () => {
    mockIdentify.mockResolvedValue({});
    mockExtract.mockReturnValue([{ partNum: '3001', confidence: 0.9 }]);
    mockResolve.mockResolvedValue([]);

    const budget = new PipelineBudget(40);
    const result = await runIdentifyPipeline({ image: fakeImage }, budget);

    expect(result.status).toBe('no_valid_candidate');
    expect(mockFindSets).not.toHaveBeenCalled();
  });

  it('returns resolved result on happy path', async () => {
    mockIdentify.mockResolvedValue({});
    mockExtract.mockReturnValue([{ partNum: '3001', confidence: 0.95 }]);
    mockResolve.mockResolvedValue([
      {
        partNum: '3001',
        name: 'Brick 2x4',
        imageUrl: null,
        confidence: 0.95,
      },
    ]);
    mockFindSets.mockResolvedValue({
      status: 'resolved',
      payload: {
        part: {
          partNum: '3001',
          name: 'Brick 2x4',
          imageUrl: null,
          confidence: 0.95,
          colorId: null,
          colorName: null,
        },
        candidates: [],
        availableColors: [],
        selectedColorId: null,
        sets: [],
      },
    });

    const budget = new PipelineBudget(40);
    const result = await runIdentifyPipeline({ image: fakeImage }, budget);

    expect(result.status).toBe('resolved');
    expect(mockFindSets).toHaveBeenCalledWith(
      expect.objectContaining({ budget })
    );
  });

  it('passes colorHint through to findSets', async () => {
    mockIdentify.mockResolvedValue({});
    mockExtract.mockReturnValue([{ partNum: '3001', confidence: 0.9 }]);
    mockResolve.mockResolvedValue([
      {
        partNum: '3001',
        name: 'Brick 2x4',
        imageUrl: null,
        confidence: 0.9,
      },
    ]);
    mockFindSets.mockResolvedValue({ status: 'no_valid_candidate' });

    const budget = new PipelineBudget(40);
    await runIdentifyPipeline({ image: fakeImage, colorHint: 4 }, budget);

    expect(mockFindSets).toHaveBeenCalledWith(
      expect.objectContaining({ colorHint: 4, budget })
    );
  });

  it('sorts candidates by confidence descending', async () => {
    mockIdentify.mockResolvedValue({});
    mockExtract.mockReturnValue([
      { partNum: 'low', confidence: 0.3 },
      { partNum: 'high', confidence: 0.9 },
      { partNum: 'mid', confidence: 0.6 },
    ]);
    mockResolve.mockResolvedValue([]);

    const budget = new PipelineBudget(40);
    await runIdentifyPipeline({ image: fakeImage }, budget);

    // resolveCandidates receives sorted candidates
    const passedCandidates = mockResolve.mock.calls[0]![0];
    expect(passedCandidates.map((c: { partNum: string }) => c.partNum)).toEqual(
      ['high', 'mid', 'low']
    );
  });
});
