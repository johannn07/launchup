import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Request body for `POST /upload/presign`. */
export class PresignUploadDto {
  @IsString()
  fileName: string;

  @IsString()
  mimeType: string;

  /** Declared byte length. Checked here for a fast, friendly rejection; the
   *  bucket's own size limit is what actually enforces it. */
  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  size: number;

  @IsOptional()
  @IsString()
  folder?: string;
}

export class PresignedUploadResponseDto {
  /** Persist this. The signed URLs expire; the key does not. */
  @IsString()
  key: string;

  @IsString()
  uploadUrl: string;

  @IsInt()
  expiresIn: number;

  /** Headers the browser must send on the PUT for the signature to match. */
  requiredHeaders: Record<string, string>;
}

export class SignedUrlResponseDto {
  @IsString()
  key: string;

  @IsString()
  url: string;

  @IsInt()
  expiresIn: number;
}
