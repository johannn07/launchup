import { randomBytes } from 'crypto';
import { OcrService } from './ocr.service';

// A PNG header with the given size; random bytes after it clear the entropy check.
function png(width: number, height: number): Buffer {
  const header = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return Buffer.concat([header, randomBytes(8192)]);
}

describe('OcrService.checkLegibility — image size', () => {
  const ocr = new OcrService();

  it('accepts a landscape page at the minimum', async () => {
    const result = await ocr.checkLegibility(png(1200, 900), 'page.png');
    expect(result.isLegible).toBe(true);
  });

  // A phone held upright: 1080 wide used to fail the 1200-pixel width rule.
  it('accepts the same page held upright', async () => {
    const result = await ocr.checkLegibility(png(900, 1200), 'page.png');
    expect(result.isLegible).toBe(true);
  });

  it('accepts a portrait phone screenshot', async () => {
    const result = await ocr.checkLegibility(png(1080, 1920), 'page.png');
    expect(result.isLegible).toBe(true);
  });

  it('rejects an image whose short side is under 900', async () => {
    const result = await ocr.checkLegibility(png(2000, 899), 'page.png');
    expect(result.isLegible).toBe(false);
    expect(result.reason).toMatch(/resolution/);
  });

  it('rejects an image whose long side is under 1200', async () => {
    const result = await ocr.checkLegibility(png(1199, 1000), 'page.png');
    expect(result.isLegible).toBe(false);
    expect(result.reason).toMatch(/resolution/);
  });

  it('reports the real width and height, not the sorted sides', async () => {
    const result = await ocr.checkLegibility(png(1080, 1920), 'page.png');
    expect(result).toMatchObject({ width: 1080, height: 1920 });
  });
});
