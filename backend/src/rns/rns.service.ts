import { EntityManager } from '@mikro-orm/core';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Rns } from 'src/entities/rns.entity';
import { Startup } from 'src/entities/startup.entity';
import { User } from 'src/entities/user.entity';
import { CreateRnsDto, UpdateRnsDto, GenerateTasksDto } from './dto';
import { ReadinessLevel } from 'src/entities/readiness-level.entity';
import { StartupRNA } from 'src/entities/rna.entity';
import { StartupReadinessLevel } from 'src/entities/startup-readiness-level.entity';
import { AiService } from 'src/ai/ai.service';
import { RnsChatHistory } from 'src/entities/rns-chat-history.entity';
import { RagQueryService } from '../rna/rag-query.service';
import { GroundedPromptBuilderService } from '../rna/grounded-prompt-builder.service';
import { OutputValidatorService } from '../rna/output-validator.service';
import { AiRunContext, AiRunService } from '../ai/ai-run.service';
import { readinessLevelsByType } from '../common/readiness-levels.util';
import { RNS_MAX_LENGTH } from './rns.constants';
import { AiRecommendation } from 'src/entities/ai-recommendation.entity';

@Injectable()
export class RnsService {
  constructor(
    private em: EntityManager,
    private readonly aiService: AiService,
    private readonly ragQueryService: RagQueryService,                // new
    private readonly groundedPromptBuilderService: GroundedPromptBuilderService, // new
    private readonly outputValidatorService: OutputValidatorService,
    private readonly aiRunService: AiRunService,
  ) {}

  async getStartupRns(startupId: number) {
    const rns = await this.em.find(
      Rns,
      { startup: { id: startupId } },
      { populate: ['assignee', 'targetLevel', 'generationRun'] },
    );

    const runIds = [
      ...new Set(
        rns
          .map((r) => r.generationRun?.id)
          .filter((id): id is number => id != null),
      ),
    ];

    // Correlation key is (generationRun.id, dimensionKey) — filter to RNS so
    // a startup's RNA recommendations against the same run don't cross in.
    const recs = runIds.length
      ? await this.em.find(AiRecommendation, {
          generationRun: { $in: runIds },
          recommendationKind: 'RNS',
        })
      : [];

    const byKey = new Map(
      recs.map((rec) => [`${rec.generationRun?.id}|${rec.dimensionKey}`, rec]),
    );

    return rns.map((r: Rns) => {
      const rec = r.generationRun
        ? byKey.get(`${r.generationRun.id}|${r.readinessType}`)
        : undefined;
      return {
        id: r.id,
        priorityNumber: r.priorityNumber,
        description: r.description,
        targetLevelId: r.targetLevel.id,
        isAiGenerated: r.isAiGenerated,
        status: r.status,
        requestedStatus: r.requestedStatus,
        approvalStatus: r.approvalStatus,
        readinessType: r.readinessType,
        startup: r.startup.id,
        assignee: r.assignee,
        targetLevelScore: r.getTargetLevelScore(),
        clickedByMentor: r.clickedByMentor,
        clickedByStartup: r.clickedByStartup,
        validationStatus: rec?.validationStatus ?? null,
        confidenceStatus: rec?.confidenceStatus ?? null,
        validationNotes: rec?.notes ?? null,
      };
    });
  }

  async createRns(dto: CreateRnsDto) {
    const rns = new Rns();
    rns.priorityNumber = dto.priorityNumber;
    rns.description = dto.description;
    rns.targetLevel = this.em.getReference(ReadinessLevel, dto.targetLevelId);
    rns.isAiGenerated = dto.isAiGenerated;
    rns.readinessType = dto.readinessType;
    rns.startup = this.em.getReference(Startup, dto.startupId);
    rns.assignee = this.em.getReference(User, dto.assigneeId);
    rns.status = dto.status;
    rns.requestedStatus = dto.status;
    rns.approvalStatus = 'Unchanged';

    await this.em.persistAndFlush(rns);
    return rns;
  }

  async deleteRns(rnsId: number) {
    const rns = await this.em.findOne(Rns, { id: rnsId });
    if (!rns) {
      throw new NotFoundException(`RNS with ID ${rnsId} does not exist.`);
    }

    await this.em.removeAndFlush(rns);
    return { message: `RNS with ID ${rnsId} deleted successfully.` };
  }

  async updateRns(rnsId: number, dto: UpdateRnsDto) {
    const rns = await this.em.findOne(Rns, { id: rnsId });

    if (!rns) {
      throw new NotFoundException(`RNS with ID ${rnsId} does not exist.`);
    }

    if (dto.readinessType !== undefined) {
      rns.readinessType = dto.readinessType;
    }

    if (dto.assigneeId !== undefined) {
      rns.assignee = this.em.getReference(User, dto.assigneeId);
    }

    if (dto.targetLevel !== undefined) {
      rns.targetLevel = this.em.getReference(ReadinessLevel, dto.targetLevel);
    }

    if (dto.description !== undefined) {
      rns.description = dto.description;
    }

    if (dto.status !== undefined) {
      rns.status = dto.status;
    }

    if (dto.requestedStatus !== undefined) {
      rns.requestedStatus = dto.requestedStatus;
    }

    if (dto.approvalStatus !== undefined) {
      rns.approvalStatus = dto.approvalStatus;
    }

    if (dto.priorityNumber !== undefined) {
      rns.priorityNumber = dto.priorityNumber;
    }

    if (dto.clickedByMentor !== undefined) {
      rns.clickedByMentor = dto.clickedByMentor;
    }

    if (dto.clickedByStartup !== undefined) {
      rns.clickedByStartup = dto.clickedByStartup;
    }

    if (typeof dto.isAiGenerated === 'boolean') {
      rns.isAiGenerated = dto.isAiGenerated;
    }

    await this.em.flush();
    return rns;
  }

  async statusChange(id: number, role: string, dto: UpdateRnsDto) {
    const rns = await this.em.findOne(Rns, { id });
    if (!rns) throw new NotFoundException('Rns not found');

    if (rns.requestedStatus === dto.status) {
      return rns;
    }

    if (role === 'Startup') {
      if (rns.status === dto.status) {
        rns.approvalStatus = 'Unchanged';
      } else {
        rns.approvalStatus = 'Pending';
      }
      rns.requestedStatus = dto.status;
    } else {
      rns.status = dto.status;
      rns.approvalStatus = 'Unchanged';
      rns.requestedStatus = dto.status;
    }

    await this.em.flush();
    return rns;
  }

async generateTasks(dto: GenerateTasksDto, ctx: AiRunContext) {
  const startup = await this.em.findOne(Startup, { id: dto.startup_id }, {
    populate: ['capsuleProposal'],
  });
  if (!startup) throw new NotFoundException('Startup not found');

  const capsuleProposalInfo = startup.capsuleProposal;
  if (!capsuleProposalInfo)
    throw new BadRequestException('No capsule proposal found.');

  let rnasToGenerateFrom: StartupRNA[] = [];
  if (dto.rnaIds && dto.rnaIds.length > 0) {
    rnasToGenerateFrom = await this.em.find(StartupRNA, {
      id: { $in: dto.rnaIds },
      startup: startup,
    }, { populate: ['readinessLevel'] });
    if (rnasToGenerateFrom.length === 0)
      throw new BadRequestException('No valid RNA found for the provided RNS IDs.');
  } else {
    throw new BadRequestException('Either rnaIds or readinessType must be provided.');
  }

  const startupReadinessLevels = await this.em.find(
    StartupReadinessLevel,
    { startup: startup },
    { populate: ['readinessLevel'] },
  );

  const { T: trl, M: mrl, A: arl, O: orl, R: rrl, I: irl } =
    readinessLevelsByType(startupReadinessLevels);

  const startupProfile = {
    title: capsuleProposalInfo.title,
    description: capsuleProposalInfo.description,
    objectives: capsuleProposalInfo.objectives,
    scope: capsuleProposalInfo.scope,
    readinessLevels: startupReadinessLevels.map(srl => ({
      type: srl.readinessLevel.readinessType,
      level: srl.readinessLevel.level,
    })),
  };

  const ragContext = await this.ragQueryService.queryVectorDatabase(dto.startup_id.toString(), {
    config: ctx.config,
    dimensions: rnasToGenerateFrom.map((rna) => ({
      readinessType: rna.readinessLevel.readinessType,
      level: rna.readinessLevel.level,
    })),
  });

  const createdRns: Rns[] = [];
  let currentPriorityNumber = dto.startPriorityNumber || 1;

  const existingRns = await this.em.find(Rns, { startup: startup }, { orderBy: { priorityNumber: 'ASC' } });
  for (const rns of existingRns) {
    rns.priorityNumber += (dto.no_of_tasks_to_create || 1) * rnasToGenerateFrom.length;
    this.em.persist(rns);
  }
  await this.em.flush();

  const targetReadinessLevel: Record<string, number> = {
    T: trl,
    M: mrl,
    A: arl,
    O: orl,
    R: rrl,
    I: irl,
  };

  const basePrompt = `
    Given these data:
    Acceleration Proposal Title: ${capsuleProposalInfo.title}
    Duration: 3 months
    I. About the startup
    A. Startup Description
    ${capsuleProposalInfo.description}
    B. Problem Statement
    ${capsuleProposalInfo.problemStatement}
    C. Target Market
    ${capsuleProposalInfo.targetMarket}
    D. Solution Description
    ${capsuleProposalInfo.solutionDescription}
    II. About the Proposed Acceleration
    A. Objectives
    ${capsuleProposalInfo.objectives}
    B. Scope of The Proposal
    ${capsuleProposalInfo.scope}
    C. Methodology and Expected Outputs
    ${capsuleProposalInfo.methodology}
    Initial Readiness Level:
    TRL ${trl}
    MRL ${mrl}
    ARL ${arl}
    ORL ${orl}
    RRL ${rrl}
    IRL ${irl}
  `;

  for (const rna of rnasToGenerateFrom) {
    const readinessType = rna.readinessLevel.readinessType;
    const term = 'Short-term';

    const rnsTaskBlock = `
--- Task ---
This is the RNA for ${readinessType} Readiness Type:
Readiness Level ${rna.readinessLevel.level}: ${rna.rna}

Create ${dto.no_of_tasks_to_create || 1} ${term} tasks for the startup's personalized learning path based on the above RNA.
Requirement: The response must be in JSON format.
JSON format: [{"target_level": (int), "description": ""}]
Requirements:
- target_level is an integer from 1 to 9
- the tasks should help increase the level of the ${readinessType} readiness type from its current level
- target_level must not exceed 9
- description has a max length of ${RNS_MAX_LENGTH} characters
`;

    let prompt: string;
    // Deliberately not `&& similarProfiles?.length > 0` — that required a peer
    // before using the grounded builder, discarding retrieved rubrics whenever
    // none cleared the 0.78 floor. With two seeded startups, that is the norm.
    if (!ragContext.lowConfidence) {
      // ragContext covers every RNA in rnasToGenerateFrom, so verifiedFrameworks
      // holds rubrics for other dimensions too (a Market row riding into a
      // Technology prompt). Filter per iteration — shipping every dimension's
      // rubric everywhere inflates the prompt and works against Objective 1.
      const dimensionScopedContext = {
        ...ragContext,
        verifiedFrameworks: ragContext.verifiedFrameworks.filter(
          (doc) => doc.readinessType === readinessType,
        ),
      };
      prompt = this.groundedPromptBuilderService.buildGroundedPrompt(
        dimensionScopedContext,
        startupProfile,
        [readinessType],
        rnsTaskBlock,
      );
    } else {
      prompt = `
${basePrompt}

This is the RNA for ${readinessType} Readiness Type Of Startup:
Readiness Level ${rna.readinessLevel.level}: ${rna.rna}

TASK: Create me ${dto.no_of_tasks_to_create || 1} ${term} tasks for the startup's personalized learning path based on the above RNA.
Requirement: The response should be in a JSON format.
It should consist of readiness level type, target level, description
JSON format: [{"target_level": (int), "description": ""}]
Requirement note:
- target_level is from 1-9
- make sure that the tasks will increase the level(target_level) of the specified readiness level type from the initial readiness level type
- target_level should not exceed to 9
- description has a max length of ${RNS_MAX_LENGTH}
      `;
    }

      const aiTasks = await this.aiService.generateTasksFromPrompt(ctx, prompt);

      if (!aiTasks || !Array.isArray(aiTasks) || aiTasks.length === 0) {
        console.warn(`AI did not return any tasks for RNA ID: ${rna.id}`);
        continue; // Skip to the next RNA if no tasks generated
      }
      const targetReadinessLevel = {
        Technology: trl,
        Market: mrl,
        Acceptance: arl,
        Organizational: orl,
        Regulatory: rrl,
        Investment: irl,
      };

      for (let i = 0; i < aiTasks.length; i++) {
        const task = aiTasks[i];
        const reviewedTarget = await this.aiService.reviewBiasScore(ctx, {
          dimensionKey: readinessType,
          rawScore: Number(task.target_level) || targetReadinessLevel[readinessType] + 1,
          maxScore: 9,
          context: [
            `Startup: ${startup.name}`,
            `Readiness type: ${readinessType}`,
            `RNA: ${rna.rna ?? ''}`,
            `Task description: ${task.description}`,
          ].join('\n'),
        });

        const targetLevel = await this.em.findOne(ReadinessLevel, {
          readinessType: readinessType,
          level: Math.min(
            reviewedTarget.correctedScore ||
              targetReadinessLevel[readinessType] + 1,
            9,
          ),
        });
        if (!targetLevel) {
          console.warn(
            `Target level not found for readinessType: ${readinessType}, level: ${task.target_level}`,
          );
          continue;
        }

      const newRns = new Rns();
      newRns.priorityNumber = currentPriorityNumber++;
      newRns.description = task.description;
      newRns.targetLevel = targetLevel;
      newRns.readinessType = readinessType;
      newRns.startup = startup;
      newRns.requestedStatus = 1;
      newRns.status = 1;
      newRns.assignee = startup.user;
      newRns.isAiGenerated = false;
      newRns.generationRun = ctx.run;

        this.em.persist(newRns);
        createdRns.push(newRns);

        const verdict = this.outputValidatorService.validate({
          content: task.description,
          retrievalLowConfidence: ragContext.lowConfidence,
          maxLength: RNS_MAX_LENGTH,
        });

        await this.aiService.recordAiRecommendation({
          startupId: startup.id,
          dimensionKey: readinessType,
          recommendationKind: 'RNS',
          content: task.description,
          validationStatus: verdict.validationStatus,
          confidenceStatus: verdict.confidenceStatus,
          notes: verdict.notes,
          generationRun: ctx.run,
        });

        const rawTarget = Number(task.target_level);
        const normalizedTarget = Number((task as any).target_level_normalized ?? rawTarget);
        const deviation = Math.abs(normalizedTarget - rawTarget);
        await this.aiService.recordBiasAudit({
          startupId: startup.id,
          dimensionKey: readinessType,
          rawScore: Number(task.target_level) || targetReadinessLevel[readinessType] + 1,
          correctedScore: reviewedTarget.correctedScore,
          deviation: Math.abs(reviewedTarget.correctedScore - (Number(task.target_level) || targetReadinessLevel[readinessType] + 1)),
          threshold: 2,
          biasFlagged: reviewedTarget.biasFlagged,
          biasStatus: reviewedTarget.biasFlagged ? 'flagged' : 'normalized',
          justification: reviewedTarget.justification,
          generationRun: ctx.run,
        });
      }
    }
    await this.em.flush(); // Flush all new RNS after the loop

  if (dto.debug) {
    return { prompt: 'See console for prompts if multiple RNS were generated.' };
  } else {
    return createdRns.map((r: Rns) => ({
      id: r.id,
      priorityNumber: r.priorityNumber,
      description: r.description,
      targetLevelId: r.targetLevel.id,
      isAiGenerated: r.isAiGenerated,
      status: r.status,
      readinessType: r.readinessType,
      startup: r.startup.id,
    }));
  }
}

  async refineRnsDescription(
    rnsId: number,
    chatHistory: {
      role: 'User' | 'Ai';
      content: string;
      refinedDescription: string | null;
    }[],
    latestPrompt: string,
    ctx: AiRunContext,
  ): Promise<{ refinedDescription: string; aiCommentary: string }> {
    const rns = await this.em.findOne(
      Rns,
      { id: rnsId },
      { populate: ['startup', 'targetLevel', 'startup.capsuleProposal'] },
    );
    if (!rns) throw new NotFoundException('RNS not found');
    const startup = rns.startup;
    // The refine route carries only the Rns id, so the run opens with
    // startupId: null. See AiRunService.attribute for why a bare assignment
    // would be discarded here.
    await this.aiRunService.attribute(ctx, startup);
    const capsuleProposalInfo = startup.capsuleProposal;
    if (!capsuleProposalInfo)
      throw new BadRequestException(
        'No capsule proposal found for this startup.',
      );

    const startupReadinessLevels = await this.em.find(
      StartupReadinessLevel,
      { startup: startup },
      { populate: ['readinessLevel'] },
    );
    const { T: trl, M: mrl, A: arl, O: orl, R: rrl, I: irl } =
      readinessLevelsByType(startupReadinessLevels);

    let prompt = `Given these data:
      Acceleration Proposal Title: ${capsuleProposalInfo.title}
      Duration: 3 months
      I. About the startup
      A. Startup Description
      ${capsuleProposalInfo.description}
      B. Problem Statement
      ${capsuleProposalInfo.problemStatement}
      C. Target Market
      ${capsuleProposalInfo.targetMarket}
      D. Solution Description
      ${capsuleProposalInfo.solutionDescription}
      II. About the Proposed Acceleration
      A. Objectives
      ${capsuleProposalInfo.objectives}
      B. Scope of The Proposal
      ${capsuleProposalInfo.scope}
      C. Methodology and Expected Outputs
      ${capsuleProposalInfo.methodology}
      Initial Readiness Level:
      TRL ${trl}
      MRL ${mrl}
      ARL ${arl}
      ORL ${orl}
      RRL ${rrl}
      IRL ${irl}

      Here is the current RNS task description: "${rns.description}"

      Given these chat history of user:\n`;

    for (const msg of chatHistory) {
      prompt += `${msg.role}: ${msg.refinedDescription ? `Refined Description: ${msg.refinedDescription}\n` : ''} ${msg.content}\n`;
    }

    prompt += `
      User: ${latestPrompt}\n
      Please rewrite or refine the RNS description according to the user's instructions. Just write the refined description, no other text.

      FORMATTING INSTRUCTIONS:
      You can use HTML formatting in your refined text:
      - <p> for paragraphs
      - <strong> for bold text
      - <em> for italic text
      - <u> for underline
      - <br> for line breaks
      - Use • (bullet character) for bullet points
      Example: <p><strong>Key Point</strong>: This is <em>important</em> information.</p>
      Example with bullets: <p>• First point<br>• Second point<br>• Third point</p>

      After you rewrite/refine the RNS description, write '=========' on a new line, then provide a brief AI commentary (1-2 sentences) explaining the changes or improvements you made. Example:\n<refined description>\n=========\n<ai commentary>
      DO NOT MENTION THE FORMATTING INSTRUCTIONS OR HOW YOU FORMATTED THE RESPONSE IN THE COMMENTARY.
    `;

    const result = await this.aiService.refineRnsDescription(ctx, prompt);

    const newMessages = [
      new RnsChatHistory({
        rns,
        role: 'User',
        content: latestPrompt,
      }),
      new RnsChatHistory({
        rns,
        role: 'Ai',
        content: result.aiCommentary,
        refinedDescription: result.refinedDescription,
      }),
    ];

    await this.em.persistAndFlush(newMessages);

    return result;
  }

  async getRnsChatHistory(rnsId: number) {
    const chatHistory = await this.em.find(
      RnsChatHistory,
      { rns: { id: rnsId } },
      { orderBy: { createdAt: 'ASC' } },
    );

    return chatHistory;
  }
}
