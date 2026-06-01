import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';

const BASELINE_FILE = path.resolve(__dirname, '..', '..', 'data', 'ai-baseline.json');

@Injectable()
export class BaselineService {
  private readonly logger = new Logger(BaselineService.name);

  // Load baseline stats from local JSON file. If missing, return empty defaults.
  private async loadBaseline(): Promise<{ mean: number; std: number }> {
    try {
      const raw = await fs.readFile(BASELINE_FILE, 'utf8');
      const json = JSON.parse(raw);
      return { mean: Number(json.mean) || 0, std: Number(json.std) || 1 };
    } catch (err) {
      this.logger.warn(`Baseline file not found or invalid: ${BASELINE_FILE}`);
      return { mean: 0, std: 1 };
    }
  }

  // Normalize a scalar AI score using z-score, then scale to 1-9 range.
  async normalizeScore(score: number): Promise<{ z: number; scaled: number }> {
    const { mean, std } = await this.loadBaseline();
    const z = std === 0 ? 0 : (score - mean) / std;
    // Map z (roughly -3..+3) to 1..9
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const scaled = clamp(Math.round(((z + 3) / 6) * 8 + 1), 1, 9);
    return { z, scaled };
  }

  // Simple helper to write/update baseline (for later use)
  async updateBaseline(mean: number, std: number) {
    const payload = { mean, std };
    await fs.mkdir(path.dirname(BASELINE_FILE), { recursive: true });
    await fs.writeFile(BASELINE_FILE, JSON.stringify(payload, null, 2), 'utf8');
  }
}
