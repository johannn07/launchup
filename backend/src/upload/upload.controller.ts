import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UseGuards,
  UploadedFile,
  UploadedFiles,
  Query,
  BadRequestException,
  Get,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { JwtGuard } from '../auth/guard';
import { UploadService } from './upload.service';
import {
  UploadResponseDto,
  MultipleUploadResponseDto,
  PresignUploadDto,
  PresignedUploadResponseDto,
  SignedUrlResponseDto,
} from './dto';

@UseGuards(JwtGuard)
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Get('test-connection')
  async testConnection(): Promise<{ message: string; status: string }> {
    try {
      await this.uploadService.testConnection();
      return {
        message: 'Object storage connection successful',
        status: 'connected',
      };
    } catch {
      // Deliberately opaque: the SDK's message names the bucket, endpoint, and
      // sometimes the credential, and this only tells the caller whether the
      // backend can reach its own storage.
      return { message: 'Object storage connection failed', status: 'failed' };
    }
  }

  /**
   * Preferred upload path: the browser asks for a signed URL, then PUTs the
   * file straight to the bucket. Keeps large files off the API process.
   */
  @Post('presign')
  async presign(
    @Body() dto: PresignUploadDto,
  ): Promise<PresignedUploadResponseDto> {
    return this.uploadService.createPresignedUpload(dto);
  }

  /** Resolves a stored key to a temporary readable URL. The bucket is private. */
  @Get('signed-url')
  async signedUrl(@Query('key') key: string): Promise<SignedUrlResponseDto> {
    if (!key) {
      throw new BadRequestException('File key is required');
    }
    return this.uploadService.createSignedDownloadUrl(key);
  }

  @Post('single')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSingle(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder?: string,
  ): Promise<UploadResponseDto> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.uploadService.uploadSingle(file, folder);
  }

  @Post('multiple')
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @Query('folder') folder?: string,
  ): Promise<MultipleUploadResponseDto> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    return this.uploadService.uploadMultiple(files, folder);
  }

  // @Delete(':key(*)')
  // async deleteFile(@Param('key') key: string): Promise<{ message: string }> {
  //   if (!key) {
  //     throw new BadRequestException('File key is required');
  //   }
  //
  //   await this.uploadService.deleteFile(key);
  //   return { message: 'File deleted successfully' };
  // }
}
