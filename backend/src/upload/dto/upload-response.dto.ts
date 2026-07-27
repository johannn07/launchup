import { IsString, IsNumber, IsDate } from 'class-validator';

export class UploadResponseDto {
  /** Stable identifier for the object — this is what callers persist. */
  @IsString()
  key: string;

  /** Signed GET URL. Expires, so never store it; re-resolve from `key`. */
  @IsString()
  url: string;

  @IsString()
  originalName: string;

  @IsString()
  mimeType: string;

  @IsNumber()
  size: number;

  @IsDate()
  uploadedAt: Date;
}

export class MultipleUploadResponseDto {
  files: UploadResponseDto[];

  @IsNumber()
  totalFiles: number;

  @IsNumber()
  totalSize: number;
}
