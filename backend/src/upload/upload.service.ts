import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3,
  PutObjectCommand,
  GetObjectCommand,
  type DeleteObjectCommandInput,
  type ListObjectsV2CommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  UploadResponseDto,
  MultipleUploadResponseDto,
  PresignUploadDto,
  PresignedUploadResponseDto,
  SignedUrlResponseDto,
} from './dto';

/** Long enough for a slow connection, short enough that a leaked URL is not a
 *  standing write grant. */
const UPLOAD_URL_TTL_SECONDS = 300;

/** Refreshed per render, so it only has to outlive the current page. */
const DOWNLOAD_URL_TTL_SECONDS = 3600;

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

@Injectable()
export class UploadService {
  private s3: S3;
  private bucketName: string;
  private enabled = false;

  constructor(private configService: ConfigService) {
    const accessKeyId = this.configService.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'S3_SECRET_ACCESS_KEY',
    );
    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    const bucketName = this.configService.get<string>('S3_BUCKET');
    const region = this.configService.get<string>('S3_REGION');

    if (
      !accessKeyId ||
      !secretAccessKey ||
      !endpoint ||
      !bucketName ||
      !region
    ) {
      console.warn(
        '⚠️  Object storage not configured (S3_* vars) – file uploads will be disabled.',
      );
      this.enabled = false;
      return;
    }

    this.bucketName = bucketName;
    this.enabled = true;

    this.s3 = new S3({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      // Non-AWS endpoints address buckets as a path segment, not a subdomain.
      // AWS accepts path style too, so this survives a provider change.
      forcePathStyle: true,
      // Otherwise the SDK checksums every request. A presigned PUT has no body
      // at signing time, so it signs an empty payload's checksum and the
      // browser's real bytes fail validation. Covered by the spec.
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Short-lived URL the browser PUTs straight to, so the API never buffers the
   * bytes. Signing `Content-Type` binds the client to the type it declared — it
   * cannot request an image URL and PUT an executable.
   *
   * Length is **not** covered: that needs a POST policy, which the S3 presigner
   * does not emit. The bucket's own max-file-size limit is the real backstop,
   * not the `size` checked here.
   */
  async createPresignedUpload(
    dto: PresignUploadDto,
  ): Promise<PresignedUploadResponseDto> {
    this.assertEnabled();
    this.validateUpload(dto.fileName, dto.mimeType, dto.size);

    const key = this.generateKey(dto.fileName, dto.folder);

    try {
      const uploadUrl = await getSignedUrl(
        this.s3,
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          ContentType: dto.mimeType,
        }),
        {
          expiresIn: UPLOAD_URL_TTL_SECONDS,
          // Only `host` is signed by default; this is what binds the type.
          signableHeaders: new Set(['content-type']),
        },
      );

      return {
        key,
        uploadUrl,
        expiresIn: UPLOAD_URL_TTL_SECONDS,
        // Must come back verbatim or the signature won't match.
        requiredHeaders: { 'Content-Type': dto.mimeType },
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to create upload URL: ${this.describe(error)}`,
      );
    }
  }

  /**
   * The bucket is private, so this is the only way stored files are read back.
   */
  async createSignedDownloadUrl(key: string): Promise<SignedUrlResponseDto> {
    this.assertEnabled();

    if (!key) {
      throw new BadRequestException('File key is required');
    }

    try {
      const url = await getSignedUrl(
        this.s3,
        new GetObjectCommand({ Bucket: this.bucketName, Key: key }),
        { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
      );

      return { key, url, expiresIn: DOWNLOAD_URL_TTL_SECONDS };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to create download URL: ${this.describe(error)}`,
      );
    }
  }

  /**
   * For callers that already hold the bytes (OCR intake, tests), and as a
   * fallback when the browser can't reach the bucket. The returned `url` is a
   * signed GET and expires — persist `key`, not `url`.
   */
  async uploadSingle(
    file: Express.Multer.File,
    folder?: string,
  ): Promise<UploadResponseDto> {
    this.assertEnabled();

    if (!file) {
      throw new BadRequestException('No file provided');
    }

    this.validateUpload(file.originalname, file.mimetype, file.size);

    const key = this.generateKey(file.originalname, folder);

    try {
      await this.s3.putObject({
        Bucket: this.bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to upload file: ${this.describe(error)}`,
      );
    }

    const { url } = await this.createSignedDownloadUrl(key);

    return {
      key,
      url,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
    };
  }

  async uploadMultiple(
    files: Express.Multer.File[],
    folder?: string,
  ): Promise<MultipleUploadResponseDto> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    const uploadResults = await Promise.all(
      files.map((file) => this.uploadSingle(file, folder)),
    );

    return {
      files: uploadResults,
      totalFiles: uploadResults.length,
      totalSize: uploadResults.reduce((sum, result) => sum + result.size, 0),
    };
  }

  async deleteFile(key: string): Promise<void> {
    this.assertEnabled();

    try {
      const params: DeleteObjectCommandInput = {
        Bucket: this.bucketName,
        Key: key,
      };

      await this.s3.deleteObject(params);
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to delete file: ${this.describe(error)}`,
      );
    }
  }

  async testConnection(): Promise<void> {
    this.assertEnabled();

    try {
      const params: ListObjectsV2CommandInput = {
        Bucket: this.bucketName,
        MaxKeys: 1,
      };

      await this.s3.listObjectsV2(params);
    } catch (error) {
      console.error('Connection test failed:', error);
      throw new InternalServerErrorException('Storage connection test failed');
    }
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'File upload is currently unavailable – object storage is not configured.',
      );
    }
  }

  private generateKey(originalName: string, folder?: string): string {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = originalName.split('.').pop();
    const baseName = originalName.split('.').slice(0, -1).join('.');

    const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${sanitizedBaseName}_${timestamp}_${randomString}.${extension}`;

    return folder ? `${folder}/${fileName}` : fileName;
  }

  private validateUpload(
    fileName: string,
    mimeType: string,
    size: number,
  ): void {
    if (!fileName) {
      throw new BadRequestException('File name is required');
    }

    if (size > MAX_FILE_BYTES) {
      throw new BadRequestException('File size exceeds 10MB limit');
    }

    // Client-supplied on the presign path, so this catches honest mistakes, not
    // a determined uploader. The bucket's own limits are what hold.
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new BadRequestException('File type not allowed');
    }
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }
}
