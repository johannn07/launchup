import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export class StartupApplicationDtoOld {
  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  userId: number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsBoolean()
  @IsNotEmpty()
  @Type(() => Boolean)
  dataPrivacy: boolean;

  @IsBoolean()
  @IsNotEmpty()
  @Type(() => Boolean)
  eligibility: boolean;

  @IsString()
  @IsOptional()
  links?: string;

  @IsString()
  @IsOptional()
  groupName?: string;

  @IsString()
  @IsOptional()
  universityName?: string;
}

export class AddStartupMemberDto {
  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  userId: number;

  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  startupId: number;
}

class HistoricalTimelineDto {
  @IsString()
  @IsNotEmpty()
  monthYear: string;

  @IsString()
  @IsNotEmpty()
  description: string;
}

class CompetitiveAdvantageDto {
  @IsString()
  @IsNotEmpty()
  competitorName: string;

  @IsString()
  @IsNotEmpty()
  offer: string;

  @IsString()
  @IsNotEmpty()
  pricingStrategy: string;
}

class MemberDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  role: string;
}

export class StartupApplicationDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  problemStatement: string;

  @IsString()
  @IsNotEmpty()
  targetMarket: string;

  @IsString()
  @IsNotEmpty()
  solutionDescription: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HistoricalTimelineDto)
  @IsOptional()
  historicalTimeline: HistoricalTimelineDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompetitiveAdvantageDto)
  @IsOptional()
  competitiveAdvantageAnalysis: CompetitiveAdvantageDto[];

  @IsString()
  @IsOptional()
  intellectualPropertyStatus?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  objectives: string[];

  @IsString()
  @IsOptional()
  proposalScope?: string;

  @IsString()
  @IsOptional()
  methodology?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MemberDto)
  @IsOptional()
  members: MemberDto[];

  @IsString()
  @IsOptional()
  curriculumVitae?: string;

  @IsBoolean()
  @IsOptional()
  dataPrivacy?: boolean;

  @IsBoolean()
  @IsOptional()
  eligibility?: boolean;

  @IsString()
  @IsOptional()
  links?: string;

  @IsString()
  @IsOptional()
  groupName?: string;

  @IsString()
  @IsOptional()
  universityName?: string;

  // sha256 from /parse-capsule-proposal; links that upload to the startup.
  @Matches(/^[0-9a-f]{64}$/)
  @IsOptional()
  ocrDocumentHash?: string;
}

export class WaitlistStartupDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  managerId: number;
}

export class AppointMentorsDto {
  @IsArray()
  @IsNumber({}, { each: true })
  @IsNotEmpty()
  @Type(() => Number)
  mentorIds: number[];
}

export class ChangeMentorDto {
  @IsNotEmpty()
  @IsNumber()
  mentorId: number;
}
