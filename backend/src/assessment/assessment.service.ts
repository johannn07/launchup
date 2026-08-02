import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import {
  CreateAssessmentDto,
  UpdateAssessmentDto,
  AssignAssessmentDto,
  AssignAssessmentsToStartupDto,
  SubmitResponsesDto,
} from './dto/assessment.dto';
import { Assessment } from '../entities/assessment.entity';
import { StartupAssessment } from '../entities/startup-assessment.entity';
import { StartupResponse } from '../entities/startup-response.entity';
import { Startup } from '../entities/startup.entity';
import { AssessmentType } from '../entities/enums/assessment-type.enum';
import { AssessmentAnswerType } from '../entities/enums/assessment-util.enum';
import { QualificationStatus } from '../entities/enums/qualification-status.enum';

@Injectable()
export class AssessmentService {
  constructor(private readonly em: EntityManager) {}

  // --- Admin: assessments ---

  /** POST /assessments — also assigns the new assessment to every qualified startup. */
  async createAssessment(dto: CreateAssessmentDto): Promise<{
    id: number;
    assessmentType: string;
    name: string;
    description?: string;
    answerType: string;
  }> {
    const assessment = this.em.create(Assessment, {
      assessmentType: dto.assessmentType,
      name: dto.name,
      description: dto.description,
      answerType: dto.answerType,
    });

    await this.em.persistAndFlush(assessment);

    const qualifiedStartups = await this.em.find(Startup, {
      qualificationStatus: QualificationStatus.QUALIFIED,
    });

    for (const startup of qualifiedStartups) {
      const startupAssessment = this.em.create(StartupAssessment, {
        startup: startup,
        assessment: assessment,
        isApplicable: true,
      });
      this.em.persist(startupAssessment);
    }

    await this.em.flush();

    return {
      id: assessment.id,
      assessmentType: assessment.assessmentType,
      name: assessment.name,
      description: assessment.description,
      answerType: AssessmentAnswerType[assessment.answerType],
    };
  }

  /** GET /assessments */
  async getAllAssessments(): Promise<
    Array<{
      id: number;
      assessmentType: string;
      name: string;
      description?: string;
      answerType: string;
    }>
  > {
    const assessments = await this.em.find(Assessment, {});

    return assessments.map((a) => ({
      id: a.id,
      assessmentType: a.assessmentType,
      name: a.name,
      description: a.description,
      answerType: AssessmentAnswerType[a.answerType],
    }));
  }

  /** GET /assessments/grouped — every type is present, empty ones included. */
  async getAssessmentsGroupedByType(): Promise<
    Record<
      string,
      Array<{
        id: number;
        name: string;
        description?: string;
        answerType: string;
      }>
    >
  > {
    const assessments = await this.em.find(Assessment, {});

    const grouped: Record<
      string,
      Array<{ id: number; name: string; description?: string; answerType: string }>
    > = {};

    Object.values(AssessmentType).forEach((type) => {
      grouped[type] = [];
    });

    assessments.forEach((assessment) => {
      grouped[assessment.assessmentType].push({
        id: assessment.id,
        name: assessment.name,
        description: assessment.description,
        answerType: AssessmentAnswerType[assessment.answerType],
      });
    });

    return grouped;
  }

  /** GET /assessments/:id */
  async getAssessmentById(id: number): Promise<{
    id: number;
    assessmentType: string;
    name: string;
    description?: string;
    answerType: string;
  }> {
    const assessment = await this.em.findOne(Assessment, { id });

    if (!assessment) {
      throw new NotFoundException(`Assessment with ID ${id} not found`);
    }

    return {
      id: assessment.id,
      assessmentType: assessment.assessmentType,
      name: assessment.name,
      description: assessment.description,
      answerType: AssessmentAnswerType[assessment.answerType],
    };
  }

  /** PATCH /assessments/:id */
  async updateAssessment(
    id: number,
    dto: UpdateAssessmentDto,
  ): Promise<{
    id: number;
    name: string;
    description?: string;
    assessmentType?: string;
    answerType?: string;
  }> {
    const assessment = await this.em.findOne(Assessment, { id });

    if (!assessment) {
      throw new NotFoundException(`Assessment with ID ${id} not found`);
    }

    if (dto.name !== undefined) {
      assessment.name = dto.name;
    }

    if (dto.description !== undefined) {
      assessment.description = dto.description;
    }

    if (dto.answerType !== undefined) {
      assessment.answerType = dto.answerType;
    }

    if (dto.assessmentType !== undefined) {
      assessment.assessmentType = dto.assessmentType;
    }

    await this.em.persistAndFlush(assessment);

    return {
      id: assessment.id,
      name: assessment.name,
      description: assessment.description,
      assessmentType: dto.assessmentType,
      answerType: dto.answerType
        ? AssessmentAnswerType[assessment.answerType]
        : undefined,
    };
  }

  /** DELETE /assessments/:id */
  async deleteAssessment(id: number): Promise<{ message: string }> {
    const assessment = await this.em.findOne(Assessment, { id });

    if (!assessment) {
      throw new NotFoundException(`Assessment with ID ${id} not found`);
    }

    await this.em.removeAndFlush(assessment);

    return { message: `Assessment ${id} deleted successfully` };
  }

  /** GET /assessments/types */
  listTypes(): Array<{ name: string }> {
    return Object.values(AssessmentType).map((type) => ({ name: type }));
  }

  // --- Startup: assignments ---

  /** POST /startups/:id/assessments */
  async assignAssessmentToStartup(
    startupId: number,
    dto: AssignAssessmentDto,
  ): Promise<{ id: number; assessmentId: number }> {
    const startup = await this.em.findOne(Startup, { id: startupId });
    if (!startup) {
      throw new NotFoundException(`Startup with ID ${startupId} not found`);
    }

    const assessment = await this.em.findOne(Assessment, {
      id: dto.assessmentId,
    });
    if (!assessment) {
      throw new NotFoundException(
        `Assessment with ID ${dto.assessmentId} not found`,
      );
    }

    const existing = await this.em.findOne(StartupAssessment, {
      startup: startup,
      assessment: assessment,
    });

    if (existing) {
      throw new BadRequestException(
        'Assessment already assigned to this startup',
      );
    }

    const startupAssessment = this.em.create(StartupAssessment, {
      startup: startup,
      assessment: assessment,
      isApplicable: true,
    });

    await this.em.persistAndFlush(startupAssessment);

    return {
      id: startupAssessment.id,
      assessmentId: assessment.id,
    };
  }

  /** POST /assessments/startup-assessment/:id — skips already-assigned ones. */
  async assignAssessmentsToStartup(id: number): Promise<{
    message: string;
  }> {
    const startup = await this.em.findOne(Startup, { id });
    if (!startup) {
      throw new NotFoundException(`Startup with ID ${id} not found`);
    }

    const allAssessments = await this.em.find(Assessment, {});

    const existingAssignments = await this.em.find(StartupAssessment, {
      startup: { id },
    });

    const existingAssessmentIds = new Set(
      existingAssignments.map((sa) => sa.assessment.id),
    );

    const newAssignments: StartupAssessment[] = [];
    for (const assessment of allAssessments) {
      if (!existingAssessmentIds.has(assessment.id)) {
        const startupAssessment = this.em.create(StartupAssessment, {
          startup,
          assessment,
          isApplicable: true,
        });
        newAssignments.push(startupAssessment);
      }
    }

    if (newAssignments.length > 0) {
      await this.em.persistAndFlush(newAssignments);
    }

    return {
      message: `Successfully assigned ${newAssignments.length} new assessment(s) to startup. Total assessments: ${allAssessments.length}`,
    };
  }

  /** GET /startups/:id/assessments */
  async getStartupAssessments(startupId: number): Promise<
    Array<{
      id: number;
      assessment: {
        id: number;
        assessmentType: string;
        name: string;
        answerType: string;
      };
      response?: {
        id: number;
        answerValue?: string;
        fileUrl?: string;
        fileName?: string;
      };
      status: 'Completed' | 'Pending';
      isApplicable: boolean;
    }>
  > {
    const startup = await this.em.findOne(Startup, { id: startupId });
    if (!startup) {
      throw new NotFoundException(`Startup with ID ${startupId} not found`);
    }

    const startupAssessments = await this.em.find(
      StartupAssessment,
      { startup: startup },
      { populate: ['assessment'] },
    );

    const responses = await this.em.find(StartupResponse, {
      startup: startup,
    });
    const responseMap = new Map(responses.map((r) => [r.assessment.id, r]));

    return startupAssessments.map((sa) => {
      const response = responseMap.get(sa.assessment.id);

      return {
        id: sa.id,
        assessment: {
          id: sa.assessment.id,
          assessmentType: sa.assessment.assessmentType,
          name: sa.assessment.name,
          answerType: AssessmentAnswerType[sa.assessment.answerType],
        },
        response: response
          ? {
              id: response.id,
              answerValue: response.answerValue,
              fileUrl: response.fileUrl,
              fileName: response.fileName,
            }
          : undefined,
        status: response ? 'Completed' : 'Pending',
        isApplicable: sa.isApplicable,
      };
    });
  }

  /** PATCH /assessments/startup-assessment/:id/toggle-applicable */
  async toggleAssessmentApplicability(
    startupAssessmentId: number,
    isApplicable: boolean,
  ): Promise<{ message: string; isApplicable: boolean }> {
    const startupAssessment = await this.em.findOne(StartupAssessment, {
      id: startupAssessmentId,
    });
    if (!startupAssessment) {
      throw new NotFoundException(
        `StartupAssessment with ID ${startupAssessmentId} not found`,
      );
    }
    startupAssessment.isApplicable = isApplicable;
    await this.em.persistAndFlush(startupAssessment);
    return {
      message: `Assessment marked as ${isApplicable ? 'applicable' : 'not applicable'}`,
      isApplicable: startupAssessment.isApplicable,
    };
  }

  // --- Startup: responses ---

  /** POST /startups/:id/responses — upserts, and skips unknown assessment ids. */
  async submitResponses(
    startupId: number,
    dto: SubmitResponsesDto,
  ): Promise<{ submitted: number; updated: number }> {
    const startup = await this.em.findOne(Startup, { id: startupId });
    if (!startup) {
      throw new NotFoundException(`Startup with ID ${startupId} not found`);
    }

    let submitted = 0;
    let updated = 0;

    for (const responseDto of dto.responses) {
      const assessment = await this.em.findOne(Assessment, {
        id: responseDto.assessmentId,
      });

      if (!assessment) {
        console.warn(
          `Assessment ${responseDto.assessmentId} not found, skipping`,
        );
        continue;
      }

      const existingResponse = await this.em.findOne(StartupResponse, {
        startup: startup,
        assessment: assessment,
      });

      if (existingResponse) {
        existingResponse.answerValue = responseDto.answerValue;
        existingResponse.fileUrl = responseDto.fileUrl;
        existingResponse.fileName = responseDto.fileName;
        this.em.persist(existingResponse);
        updated++;
      } else {
        const newResponse = this.em.create(StartupResponse, {
          startup: startup,
          assessment: assessment,
          answerValue: responseDto.answerValue,
          fileUrl: responseDto.fileUrl,
          fileName: responseDto.fileName,
        });
        this.em.persist(newResponse);
        submitted++;
      }
    }

    await this.em.flush();

    return { submitted, updated };
  }

  /** GET /startups/:id/responses/:assessmentId */
  async getAssessmentResponses(
    startupId: number,
    assessmentId: number,
  ): Promise<{
    id: number;
    name: string;
    assessmentType: string;
    answerType: string;
    answerValue?: string;
    fileUrl?: string;
    fileName?: string;
  }> {
    const startup = await this.em.findOne(Startup, { id: startupId });
    if (!startup) {
      throw new NotFoundException(`Startup with ID ${startupId} not found`);
    }

    const assessment = await this.em.findOne(Assessment, { id: assessmentId });

    if (!assessment) {
      throw new NotFoundException(
        `Assessment with ID ${assessmentId} not found`,
      );
    }

    const response = await this.em.findOne(StartupResponse, {
      startup: startup,
      assessment: assessment,
    });

    return {
      id: assessment.id,
      name: assessment.name,
      assessmentType: assessment.assessmentType,
      answerType: AssessmentAnswerType[assessment.answerType],
      answerValue: response?.answerValue,
      fileUrl: response?.fileUrl,
      fileName: response?.fileName,
    };
  }
}
