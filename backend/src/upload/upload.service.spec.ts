import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UploadService } from './upload.service';

const CONFIGURED = {
  S3_ACCESS_KEY_ID: 'test-access-key',
  S3_SECRET_ACCESS_KEY: 'test-secret-key',
  S3_ENDPOINT: 'https://example.storage.supabase.co/storage/v1/s3',
  S3_BUCKET: 'launchup',
  S3_REGION: 'ap-southeast-1',
};

async function buildService(
  env: Record<string, string> = CONFIGURED,
): Promise<UploadService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      UploadService,
      {
        provide: ConfigService,
        useValue: { get: (key: string) => env[key] },
      },
    ],
  }).compile();

  return module.get<UploadService>(UploadService);
}

const pngFile = (overrides: Partial<Express.Multer.File> = {}) =>
  ({
    originalname: 'diagram.png',
    mimetype: 'image/png',
    size: 1024,
    buffer: Buffer.from('fake'),
    ...overrides,
  }) as Express.Multer.File;

describe('UploadService', () => {
  // Signing is a local HMAC — no network and no real account involved, so the
  // presigned URLs below are genuinely produced by the SDK, not stubbed.
  describe('when object storage is configured', () => {
    let service: UploadService;

    beforeEach(async () => {
      service = await buildService();
    });

    it('reports itself enabled', () => {
      expect(service.isEnabled).toBe(true);
    });

    it('signs an upload URL for the generated key', async () => {
      const result = await service.createPresignedUpload({
        fileName: 'quarterly report.pdf',
        mimeType: 'application/pdf',
        size: 2048,
        folder: 'assessments',
      });

      expect(result.key).toMatch(
        /^assessments\/quarterly_report_\d+_[a-z0-9]+\.pdf$/,
      );
      expect(result.uploadUrl).toContain('/launchup/assessments/');
      expect(result.uploadUrl).toContain('X-Amz-Signature=');
      expect(result.uploadUrl).toContain('X-Amz-Expires=300');
      expect(result.expiresIn).toBe(300);
      expect(result.requiredHeaders).toEqual({
        'Content-Type': 'application/pdf',
      });
    });

    it('signs the content type so the client cannot swap it', async () => {
      const result = await service.createPresignedUpload({
        fileName: 'photo.png',
        mimeType: 'image/png',
        size: 10,
      });

      // Defaults to `host` alone, which would leave requiredHeaders decorative.
      expect(result.uploadUrl).toContain(
        'X-Amz-SignedHeaders=content-type%3Bhost',
      );
    });

    it('does not bake a checksum of the empty signing-time body into the URL', async () => {
      const result = await service.createPresignedUpload({
        fileName: 'photo.png',
        mimeType: 'image/png',
        size: 10,
      });

      // The SDK otherwise signs CRC32 of no body, and the browser's real bytes
      // then fail validation at the bucket — every upload would 400.
      expect(result.uploadUrl).not.toContain('x-amz-checksum');
      expect(result.uploadUrl).not.toContain('x-amz-sdk-checksum-algorithm');
    });

    it('signs a download URL with the longer read TTL', async () => {
      const result = await service.createSignedDownloadUrl(
        'assessments/photo_1_abc.png',
      );

      expect(result.key).toBe('assessments/photo_1_abc.png');
      expect(result.url).toContain('X-Amz-Signature=');
      expect(result.url).toContain('X-Amz-Expires=3600');
      expect(result.expiresIn).toBe(3600);
    });

    it('rejects a missing download key', async () => {
      await expect(service.createSignedDownloadUrl('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects files over the 10MB cap', async () => {
      await expect(
        service.createPresignedUpload({
          fileName: 'huge.pdf',
          mimeType: 'application/pdf',
          size: 11 * 1024 * 1024,
        }),
      ).rejects.toThrow('File size exceeds 10MB limit');
    });

    it('rejects a MIME type outside the allowlist', async () => {
      await expect(
        service.createPresignedUpload({
          fileName: 'payload.exe',
          mimeType: 'application/x-msdownload',
          size: 512,
        }),
      ).rejects.toThrow('File type not allowed');
    });

    it('omits the folder prefix when none is given', async () => {
      const result = await service.createPresignedUpload({
        fileName: 'notes.txt',
        mimeType: 'text/plain',
        size: 12,
      });

      expect(result.key).not.toContain('/');
    });

    it('validates proxied uploads with the same rules', async () => {
      await expect(
        service.uploadSingle(pngFile({ size: 20 * 1024 * 1024 })),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('when object storage is not configured', () => {
    let service: UploadService;

    beforeEach(async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      service = await buildService({});
    });

    afterEach(() => jest.restoreAllMocks());

    it('reports itself disabled instead of constructing a client', () => {
      expect(service.isEnabled).toBe(false);
    });

    it('503s on presign rather than throwing a credentials error', async () => {
      await expect(
        service.createPresignedUpload({
          fileName: 'a.png',
          mimeType: 'image/png',
          size: 1,
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('503s on proxied upload', async () => {
      await expect(service.uploadSingle(pngFile())).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    // Previously threw a TypeError on an undefined client instead of a 503.
    it('503s on delete', async () => {
      await expect(service.deleteFile('some/key.png')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
