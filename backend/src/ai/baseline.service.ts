import { Injectable, Logger } from '@nestjs/common';
import { existsSync, promises as fs } from 'fs';
import * as path from 'path';

// Two levels up from src/ai, three from dist/src/ai after a build. Checks the
// file, not the folder: a stray dist/data would otherwise win.
export function resolveBaselineFile(dir: string): string {
  const candidates = [
    path.resolve(dir, '..', '..', 'data', 'ai-baseline.json'),
    path.resolve(dir, '..', '..', '..', 'data', 'ai-baseline.json'),
  ];
  return candidates.find((file) => existsSync(file)) ?? candidates[candidates.length - 1];
}

const BASELINE_FILE = resolveBaselineFile(__dirname);

@Injectable()
export class BaselineService {
  private readonly logger = new Logger(BaselineService.name);

  // Null when unusable. A substitute mean 0 / std 1 used to stand in, which
  // scaled every score of 2 or more up to 8 or 9.
  private async loadBaseline(): Promise<{ mean: number; std: number } | null> {
    try {
      const raw = await fs.readFile(BASELINE_FILE, 'utf8');
      const json = JSON.parse(raw) as { mean?: unknown; std?: unknown };
      const mean = Number(json.mean);
      const std = Number(json.std);
      if (!Number.isFinite(mean) || !Number.isFinite(std) || std <= 0) {
        this.logger.warn(`Baseline is insufficient (mean ${String(json.mean)}, std ${String(json.std)}); scores left uncorrected`);
        return null;
      }
      return { mean, std };
    } catch {
      this.logger.warn(`Baseline file not found or invalid: ${BASELINE_FILE}; scores left uncorrected`);
      return null;
    }
  }

  // Normalize a scalar AI score using z-score, then scale to 1-9 range.
  // SRS 2.1: without a usable baseline the score passes through uncorrected.
  async normalizeScore(score: number): Promise<{ z: number; scaled: number; baselineAvailable: boolean }> {
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const baseline = await this.loadBaseline();
    if (!baseline) return { z: 0, scaled: clamp(Math.round(score), 1, 9), baselineAvailable: false };
    const z = (score - baseline.mean) / baseline.std;
    // z is roughly -3..+3; the readiness scale is 1..9.
    const scaled = clamp(Math.round(((z + 3) / 6) * 8 + 1), 1, 9);
    return { z, scaled, baselineAvailable: true };
  }

  // Simple helper to write/update baseline (for later use)
  async updateBaseline(mean: number, std: number) {
    const payload = { mean, std };
    await fs.mkdir(path.dirname(BASELINE_FILE), { recursive: true });
    await fs.writeFile(BASELINE_FILE, JSON.stringify(payload, null, 2), 'utf8');
  }
}
