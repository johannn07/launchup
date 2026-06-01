import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

const TMP_PREFIX = 'launchup-ocr-';

/**
 * Partial OCR service.
 * - Currently returns a stubbed transcription when given a file path.
 * - Designed as a placeholder so a real OCR engine (Tesseract, AWS Textract, etc.)
 *   can be integrated later.
 */
@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  async checkLegibility(fileBuffer: Buffer, fileName: string): Promise<{
    isLegible: boolean;
    reason: string | null;
    width: number | null;
    height: number | null;
  }> {
    const mime = this.detectMime(fileName);
    const dimensions = this.readImageDimensions(fileBuffer, mime);

    if (!dimensions) {
      return {
        isLegible: false,
        reason: 'Unsupported or unreadable image format',
        width: null,
        height: null,
      };
    }

    const { width, height } = dimensions;
    if (width < 1200 || height < 900) {
      return {
        isLegible: false,
        reason: 'Image resolution is too low for reliable OCR',
        width,
        height,
      };
    }

    const sampledBytes = fileBuffer.subarray(Math.max(0, fileBuffer.length - 4096));
    const entropy = this.computeEntropy(sampledBytes);
    if (entropy < 4.2) {
      return {
        isLegible: false,
        reason: 'Image contrast appears too low for reliable OCR',
        width,
        height,
      };
    }

    return {
      isLegible: true,
      reason: null,
      width,
      height,
    };
  }

  private detectMime(fileName: string) {
    const ext = path.extname(fileName).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    return 'application/octet-stream';
  }

  private readImageDimensions(buffer: Buffer, mime: string): { width: number; height: number } | null {
    if (mime === 'image/png' && buffer.length >= 24 && buffer.readUInt32BE(0) === 0x89504e47) {
      return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
      };
    }

    if (mime === 'image/jpeg' && buffer.length > 10 && buffer.readUInt16BE(0) === 0xffd8) {
      let offset = 2;
      while (offset + 8 < buffer.length) {
        if (buffer[offset] !== 0xff) {
          break;
        }

        const marker = buffer[offset + 1];
        const length = buffer.readUInt16BE(offset + 2);
        if (marker >= 0xc0 && marker <= 0xc3) {
          return {
            height: buffer.readUInt16BE(offset + 5),
            width: buffer.readUInt16BE(offset + 7),
          };
        }

        offset += 2 + length;
      }
    }

    return null;
  }

  private computeEntropy(buffer: Buffer): number {
    if (buffer.length === 0) {
      return 0;
    }

    const counts = new Array(256).fill(0);
    for (const byte of buffer) {
      counts[byte] += 1;
    }

    let entropy = 0;
    for (const count of counts) {
      if (!count) {
        continue;
      }

      const probability = count / buffer.length;
      entropy -= probability * Math.log2(probability);
    }

    return entropy;
  }
  async parseImageFile(filePath: string): Promise<{ text: string }> {
    // Minimal safety: ensure file exists
    try {
      const abs = path.resolve(filePath);
      await fs.access(abs);
      // Try to use tesseract.js if available
      try {
        // dynamic import so app still runs if the package isn't installed yet
        const tesseract = await import('tesseract.js');
        const { createWorker } = tesseract;
        const worker = await createWorker();
        await worker.load();
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        const { data } = await worker.recognize(abs);
        await worker.terminate();
        // compute average confidence when available
        let avgConfidence: number | undefined = undefined;
        try {
          const words = data.words || [];
          if (words.length) {
            const sum = words.reduce((s: number, w: any) => s + (w.confidence || 0), 0);
            avgConfidence = sum / words.length;
          }
        } catch {}
        return { text: data.text, avgConfidence } as any;
      } catch (err) {
        this.logger.debug('tesseract.js not available or failed, trying Google Vision text detection');
        try {
          const v = await this.detectTextWithVision(abs);
          if (v && v.text) {
            return { text: v.text, avgConfidence: v.avgConfidence } as any;
          }
        } catch (vErr) {
          this.logger.debug('Vision text detection failed', vErr?.message ?? vErr);
        }

        this.logger.warn('No OCR engine available — returning placeholder');
        const stub = `OCR_PLACEHOLDER: parsed ${path.basename(abs)} - integrate real OCR engine`;
        return { text: stub };
      }
    } catch (err) {
      return { text: '' };
    }
  }

  async parseBuffer(_buf: Buffer): Promise<{ text: string }> {
    // Write buffer to a temp file then call parseImageFile to reuse logic
    try {
      const tmpFile = path.join(os.tmpdir(), `${TMP_PREFIX}${Date.now()}.png`);
      await fs.writeFile(tmpFile, _buf);
      const res = await this.parseImageFile(tmpFile);
      // best-effort cleanup
      try {
        await fs.unlink(tmpFile);
      } catch {}
      return { text: res.text, avgConfidence: (res as any).avgConfidence } as any;
    } catch (err) {
      return { text: 'OCR_PLACEHOLDER: buffer received (error writing temp file)' };
    }
  }

  // Heuristic sketch detection using parsed text length and entropy
  detectSketch(parsedText: string, buffer: Buffer, tesseractAvgConfidence?: number) {
    const text = String(parsedText || '').trim();
    const textLength = text.length;
    const sampled = buffer.subarray(Math.max(0, buffer.length - 8192));
    const entropy = this.computeEntropy(sampled);

    const letters = (text.match(/[A-Za-z]/g) || []).length;
    const digits = (text.match(/[0-9]/g) || []).length;
    const nonAlpha = Math.max(0, textLength - letters);
    const nonAlphaRatio = textLength ? nonAlpha / textLength : 0;
    const newlineCount = (text.match(/\n/g) || []).length;
    const newlineRatio = textLength ? newlineCount / textLength : 0;
    const words = (text.match(/\S+/g) || []) as string[];
    const avgWordLen = words.length ? words.reduce((s: number, w: string) => s + (w?.length || 0), 0) / words.length : 0;
    const repeatedNonAlphaSeqs = (text.match(/[^A-Za-z0-9\s]{4,}/g) || []).length;

    // Score components (higher -> more likely a sketch/diagram)
    let score = 0;
    if (textLength < 120) score += 0.30;
    if (nonAlphaRatio > 0.35) score += 0.25;
    if (repeatedNonAlphaSeqs > 0) score += 0.15;
    if (newlineRatio > 0.15) score += 0.10;
    if (avgWordLen > 0 && avgWordLen < 3.5) score += 0.10;
    if (entropy >= 5.5) score += 0.10;
    if (tesseractAvgConfidence !== undefined && tesseractAvgConfidence < 60) score += 0.20;

    // normalize
    const sketchConfidence = Math.min(1, Number(score.toFixed(2)));
    const sketchDetected = sketchConfidence >= 0.45 || (textLength < 40 && entropy >= 4.8);

    return { sketchDetected, sketchConfidence, entropy, textLength, nonAlphaRatio, avgWordLen };
  }

  // Optional Google Vision integration: returns label annotations if client available
  async detectWithVision(buffer: Buffer) {
    try {
      const vision: any = await import('@google-cloud/vision').catch(() => null);
      if (!vision) {
        this.logger.debug('Google Vision module not available');
        return { labels: [] };
      }
      const { ImageAnnotatorClient } = vision;
      const client = new ImageAnnotatorClient();
      const [result] = await client.labelDetection(buffer as any);
      const labels = (result.labelAnnotations || []).map((l: any) => ({ description: l.description, score: l.score }));
      return { labels };
    } catch (err) {
      this.logger.debug('Google Vision not available or failed', err?.message ?? err);
      return { labels: [] };
    }
  }

  async detectTextWithVision(filePathOrBuffer: string | Buffer) {
    try {
      const vision: any = await import('@google-cloud/vision').catch(() => null);
      if (!vision) {
        this.logger.debug('Google Vision module not available');
        return { text: '', avgConfidence: undefined };
      }
      const { ImageAnnotatorClient } = vision;
      const client = new ImageAnnotatorClient();
      let result: any;
      if (Buffer.isBuffer(filePathOrBuffer)) {
        const res = await client.textDetection(filePathOrBuffer as Buffer);
        result = res && res[0] ? res[0] : undefined;
      } else {
        const res = await client.textDetection(filePathOrBuffer as string);
        result = res && res[0] ? res[0] : undefined;
      }
      const annotation = result?.fullTextAnnotation || result?.textAnnotations?.[0];
      const text = annotation ? (annotation.text || annotation.description || '') : '';
      return { text, avgConfidence: undefined };
    } catch (err) {
      this.logger.debug('detectTextWithVision failed', err?.message ?? err);
      return { text: '', avgConfidence: undefined };
    }
  }
}
