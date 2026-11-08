import { IsString, IsOptional, Matches } from 'class-validator';

export class UpdateCapsuleProposalDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  problemStatement?: string;

  @IsString()
  @IsOptional()
  targetMarket?: string;

  @IsString()
  @IsOptional()
  solution?: string;

  @IsString()
  @IsOptional()
  objectives?: string;

  @IsString()
  @IsOptional()
  scope?: string;

  @IsString()
  @IsOptional()
  methodology?: string;

  // sha256 from /parse-capsule-proposal; links that upload to the startup.
  @Matches(/^[0-9a-f]{64}$/)
  @IsOptional()
  ocrDocumentHash?: string;
}
