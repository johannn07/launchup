import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsBoolean,
  IsUrl,
} from 'class-validator';
import { Type, Transform } from 'class-transformer'; // Re-added Transform
import { QualificationStatus } from '../../entities/enums/qualification-status.enum';
import { Sector } from '../../entities/enums/sector.enum';
import { BusinessModel } from '../../entities/enums/business-model.enum';

export class UpdateStartupDto {
  @IsString()
  @IsOptional()
  name?: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  userId?: number;

  @Transform(({ value }) => {
    // Forms post the enum key as a string; the entity stores the numeric value.
    if (
      typeof value === 'string' &&
      QualificationStatus[value as keyof typeof QualificationStatus] !==
        undefined
    ) {
      return QualificationStatus[value as keyof typeof QualificationStatus]; // Return the numeric value
    }
    // If it's already a number (e.g., from a raw JSON body or already transformed), or invalid, pass it through for @IsEnum to validate
    return value;
  })
  @IsEnum(QualificationStatus)
  @IsOptional()
  qualificationStatus?: QualificationStatus;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  dataPrivacy?: boolean;

  @IsString()
  @IsOptional()
  links?: string;

  @IsString()
  @IsOptional()
  groupName?: string;

  @IsString()
  @IsOptional()
  universityName?: string;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  eligibility?: boolean;

  @IsEnum(Sector)
  @IsOptional()
  sector?: Sector;

  @IsEnum(BusinessModel)
  @IsOptional()
  businessModel?: BusinessModel;
}
