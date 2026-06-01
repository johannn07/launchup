import { DateTimeType, Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import { Startup } from './startup.entity';

@Entity({ tableName: 'ocr_documents' })
export class OcrDocument {
  @PrimaryKey({ autoincrement: true })
  id!: number;

  @ManyToOne(() => Startup, { nullable: true, deleteRule: 'set null' })
  startup?: Startup;

  @Property({ length: 255, nullable: true })
  originalFilename?: string;

  @Property({ type: 'text', nullable: true })
  extractedText?: string;

  @Property({ type: 'json', nullable: true })
  fieldConfidence?: Record<string, number>;

  @Property({ length: 40, default: 'processed' })
  processingStatus!: string;

  @Property({ length: 40, default: 'verified' })
  legibilityStatus!: string;

  @Property({ type: 'text', nullable: true })
  sourcePath?: string;

  @Property({ nullable: true })
  sketchDetected?: boolean;

  @Property({ nullable: true })
  sketchConfidence?: number;

  @Property({ type: 'json', nullable: true })
  visionLabels?: Array<{ description: string; score: number }>;

  @Property({ nullable: true })
  imageWidth?: number;

  @Property({ nullable: true })
  imageHeight?: number;

  @Property({ type: DateTimeType })
  createdAt: Date = new Date();
}