import { promises as fs } from 'fs';
import * as path from 'path';
import { BaselineService, resolveBaselineFile } from './baseline.service';

describe('BaselineService.normalizeScore', () => {
  afterEach(() => jest.restoreAllMocks());

  it('scales against a usable baseline', async () => {
    jest
      .spyOn(fs, 'readFile')
      .mockResolvedValue(JSON.stringify({ mean: 5, std: 2 }));
    const res = await new BaselineService().normalizeScore(5);
    expect(res).toEqual({ z: 0, scaled: 5, baselineAvailable: true });
  });

  // SRS 2.1: an insufficient baseline must not correct the score. The old
  // mean 0 / std 1 fallback pushed a raw 5 up to 9.
  it('leaves the score uncorrected when the baseline file is missing', async () => {
    jest.spyOn(fs, 'readFile').mockRejectedValue(new Error('ENOENT'));
    const res = await new BaselineService().normalizeScore(5);
    expect(res).toEqual({ z: 0, scaled: 5, baselineAvailable: false });
  });

  it('treats a zero or missing standard deviation as insufficient', async () => {
    jest
      .spyOn(fs, 'readFile')
      .mockResolvedValue(JSON.stringify({ mean: 5, std: 0 }));
    const res = await new BaselineService().normalizeScore(7);
    expect(res).toEqual({ z: 0, scaled: 7, baselineAvailable: false });
  });

  it('clamps an uncorrected score to the 1 to 9 scale', async () => {
    jest.spyOn(fs, 'readFile').mockRejectedValue(new Error('ENOENT'));
    expect((await new BaselineService().normalizeScore(12)).scaled).toBe(9);
  });
});

// The built server runs from dist/src/ai, where two levels up is dist/, which
// the build never fills. Every normalization used the fallback until 2026-11-03.
describe('resolveBaselineFile', () => {
  const backendRoot = path.resolve(__dirname, '..', '..');
  const repoFile = path.join(backendRoot, 'data', 'ai-baseline.json');

  it('finds the repo file when running from src', () => {
    expect(resolveBaselineFile(path.join(backendRoot, 'src', 'ai'))).toBe(repoFile);
  });

  it('finds the repo file when running from the build output', () => {
    expect(resolveBaselineFile(path.join(backendRoot, 'dist', 'src', 'ai'))).toBe(repoFile);
  });
});
