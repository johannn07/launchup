import { EntityManager } from '@mikro-orm/core';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Initiative } from 'src/entities/initiative.entity';
import {
  CreateInitiativeDto,
  GenerateInitiativeDto,
  UpdateInitiativeDto,
} from './dto/initiative.dto';
import { Rns } from 'src/entities/rns.entity';
import { User } from 'src/entities/user.entity';
import { Startup } from 'src/entities/startup.entity';
import { AiService } from 'src/ai/ai.service';
import { RnsStatus } from 'src/entities/enums/rns.enum';
import { InitiativeChatHistory } from 'src/entities/initiative-chat-history.entity';
import { AiRunContext, AiRunService } from '../ai/ai-run.service';
import { withAiRetry } from '../ai/retry-transient';
import { JSON_NO_CHANGE_RULE } from '../ai/refine-chat';

@Injectable()
export class InitiativeService {
  constructor(
    private readonly em: EntityManager,
    private readonly aiService: AiService,
    private readonly aiRunService: AiRunService,
  ) {}

  async getStartupInitiative(startupId: number): Promise<Initiative[]> {
    return this.em.find(
      Initiative,
      { startup: startupId },
      { orderBy: { id: 'ASC' } },
    );
  }

  async createInitiative(dto: CreateInitiativeDto) {
    const initiative = new Initiative();
    initiative.initiativeNumber = dto.initiativeNumber;
    initiative.priorityNumber = 0;
    initiative.status = dto.status;
    initiative.requestedStatus = dto.status;
    initiative.approvalStatus = 'Unchanged';
    initiative.rns = this.em.getReference(Rns, dto.rnsId);
    initiative.isAiGenerated = dto.isAiGenerated;
    initiative.assignee = this.em.getReference(User, dto.assigneeId);
    initiative.startup = this.em.getReference(Startup, dto.startupId);
    initiative.description = dto.description;
    initiative.measures = dto.measures;
    initiative.targets = dto.targets;
    initiative.remarks = dto.remarks;

    await this.em.persistAndFlush(initiative);
    return initiative;
  }

  async update(id: number, dto: UpdateInitiativeDto) {
    const initiative = await this.em.findOne(Initiative, { id });
    if (!initiative) throw new NotFoundException('Initiative not found');

    if (dto.initiativeNumber !== undefined) {
      initiative.initiativeNumber = dto.initiativeNumber;
    }

    if (dto.status !== undefined) {
      initiative.status = dto.status;
    }

    if (dto.requestedStatus !== undefined) {
      initiative.requestedStatus = dto.requestedStatus;
    }

    if (dto.approvalStatus !== undefined) {
      initiative.approvalStatus = dto.approvalStatus;
    }

    if (dto.isAiGenerated !== undefined) {
      initiative.isAiGenerated = dto.isAiGenerated;
    }

    if ((dto as any).rnsId !== undefined) {
      initiative.rns = this.em.getReference(Rns, dto.rnsId);
    }

    if ((dto as any).assigneeId !== undefined) {
      initiative.assignee = this.em.getReference(User, dto.assigneeId);
    }

    if ((dto as any).startupId !== undefined) {
      initiative.startup = this.em.getReference(Startup, dto.startupId);
    }

    if ((dto as any).description !== undefined) {
      initiative.description = dto.description;
    }

    if ((dto as any).measures !== undefined) {
      initiative.measures = dto.measures;
    }

    if ((dto as any).targets !== undefined) {
      initiative.targets = dto.targets;
    }

    if ((dto as any).remarks !== undefined) {
      initiative.remarks = dto.remarks;
    }

    if (dto.clickedByMentor !== undefined) {
      initiative.clickedByMentor = dto.clickedByMentor;
    }

    if (dto.clickedByStartup !== undefined) {
      initiative.clickedByStartup = dto.clickedByStartup;
    }

    await this.em.flush();
    return initiative;
  }

  async statusChange(id: number, role: string, dto: UpdateInitiativeDto) {
    const initiative = await this.em.findOne(Initiative, { id });
    if (!initiative) throw new NotFoundException('Initiative not found');

    if (initiative.requestedStatus === dto.status) {
      return initiative;
    }

    if (role === 'Startup') {
      if (initiative.status === dto.status) {
        initiative.approvalStatus = 'Unchanged';
      } else {
        initiative.approvalStatus = 'Pending';
      }
      initiative.requestedStatus = dto.status;
    } else {
      initiative.status = dto.status;
      initiative.approvalStatus = 'Unchanged';
      initiative.requestedStatus = dto.status;
    }

    await this.em.flush();
    return initiative;
  }

  async delete(id: number) {
    const initiative = await this.em.findOne(Initiative, { id });
    if (!initiative) throw new NotFoundException('Initiative not found');

    await this.em.removeAndFlush(initiative);
    return { message: 'Initiative deleted successfully' };
  }

  async generateInitiatives(dto: GenerateInitiativeDto, ctx: AiRunContext) {
    const debugPrompts: string[] = [];
    if (dto.rnsIds && dto.rnsIds.length > 0) {
      const initiatives: Initiative[] = [];

      // Resolved up front so a bad id throws before the renumbering loop
      // mutates any existing Initiative row.
      const rnsList: Rns[] = [];
      for (const rnsId of dto.rnsIds) {
        const rns = await this.em.findOneOrFail(
          Rns,
          { id: rnsId },
          {
            populate: [
              'startup',
              'startup.capsuleProposal',
              'readinessType',
              'status',
              'targetLevel',
            ],
          },
        );
        rnsList.push(rns);

        if (rnsList.length === 1) {
          // GenerateInitiativeDto carries no startup id, so the run opens with
          // startupId: null and is attributed here instead. attribute() writes
          // immediately — a bare assignment is discarded on any path that never
          // flushes (a throw, or the empty-fallback success path), leaving
          // startup_id NULL.
          //
          // Attributing from the first Rns assumes the batch is single-startup.
          // True of the only caller (the initiatives board's "generate for
          // selected RNS"), but not enforced by the DTO — a mixed batch lands on
          // the first startup rather than whichever happened to be processed last.
          await this.aiRunService.attribute(ctx, rns.startup);
        }
      }

      // This startup's only: the query was unfiltered, so every generation
      // renumbered every startup's initiatives.
      const existingInitiatives = await this.em.find(
        Initiative,
        { startup: rnsList[0].startup },
        { orderBy: { initiativeNumber: 'ASC' } },
      );
      let minInitiativeNumber =
        existingInitiatives.length > 0
          ? existingInitiatives[0].initiativeNumber
          : 1;
      if (minInitiativeNumber > 1) minInitiativeNumber = 1;

      // Each next step's initiatives take one number and save as they go, so
      // existing rows shift by the numbers taken, after the AI calls — also
      // when a later call fails. Shifting first left gaps on every failure.
      let numbersTaken = 0;
      try {
        for (let i = 0; i < rnsList.length; i++) {
          const rns = rnsList[i];

          const maxInitiativeNumber =
            (await this.em.count(Initiative, { startup: rns.startup })) + 1;

          const basePrompt = await this.aiService.createBasePrompt(ctx, rns.startup, this.em);
          if (!basePrompt)
            throw new BadRequestException('No capsule proposal found');

          const rnsPrompt = `
            priorityNumber: ${rns.priorityNumber}
            readinessType: ${rns.readinessType}
            targetLevel: ${rns.targetLevel.level}
            description: ${rns.description}
            taskType: ${RnsStatus[rns.status]}
            `;

          const prompt = `
            ${basePrompt}   

            Based on this RNS:
            ${rnsPrompt}

            Task: Create me ${dto.no_of_initiatives_to_create} initiatives for the startup's personalized RNS.
            Requirement: The response should be in a JSON format.
            It should consist of description, measures, targets, remarks
            JSON format: [{"description": "", "measures": "", "targets": "", "remarks":""}]
            Requirement note:
            - description max 400
            - measures, targets, and remarks max 150
            `;

          if (dto.debug) {
            debugPrompts.push(prompt);
            continue;
          }

          const resultText = await withAiRetry(() =>
            this.aiService.generateInitiativesFromPrompt(ctx, prompt),
          );

          for (const entry of resultText) {
            const initiative = new Initiative();
            initiative.initiativeNumber = minInitiativeNumber + i;
            initiative.description = entry.description;
            initiative.measures = entry.measures;
            initiative.targets = entry.targets;
            initiative.remarks = entry.remarks;
            initiative.rns = rns;
            initiative.isAiGenerated = false;
            initiative.startup = rns.startup;
            initiative.assignee = rns.startup.user;
            initiative.status = 1;
            initiative.priorityNumber = 0;
            initiative.requestedStatus = 1;
            initiative.generationRun = ctx.run;

            await this.em.persistAndFlush(initiative);
            initiatives.push(initiative);
          }
          if (resultText.length > 0) numbersTaken = i + 1;
        }
      } finally {
        await this.shiftInitiativeNumbers(existingInitiatives, numbersTaken);
      }

      if (dto.debug) return { prompts: debugPrompts };

      return initiatives;
    } else if (dto.rnsId) {
      // Resolved before the renumbering loop so a bad id throws first.
      const rns = await this.em.findOneOrFail(
        Rns,
        { id: dto.rnsId },
        {
          populate: [
            'startup',
            'startup.capsuleProposal',
            'readinessType',
            'status',
            'targetLevel',
          ],
        },
      );

      // See the batch branch above for why this goes through attribute().
      await this.aiRunService.attribute(ctx, rns.startup);

      const existingInitiatives = await this.em.find(
        Initiative,
        { startup: rns.startup },
        { orderBy: { initiativeNumber: 'ASC' } },
      );
      let minInitiativeNumber =
        existingInitiatives.length > 0
          ? existingInitiatives[0].initiativeNumber
          : 1;
      if (minInitiativeNumber > 1) minInitiativeNumber = 1;

      const basePrompt = await this.aiService.createBasePrompt(ctx, rns.startup, this.em);
      if (!basePrompt)
        throw new BadRequestException('No capsule proposal found');

      const rnsPrompt = `
            priorityNumber: ${rns.priorityNumber}
            readinessType: ${rns.readinessType}
            targetLevel: ${rns.targetLevel.level}
            description: ${rns.description}
            taskType: ${RnsStatus[rns.status]}
            `;

      const prompt = `
            ${basePrompt}

            Based on this RNS:
            ${rnsPrompt}

            Task: Create me ${dto.no_of_initiatives_to_create} initiatives for the startup's personalized RNS.
            Requirement: The response should be in a JSON format.
            It should consist of description, measures, targets, remarks
            JSON format: [{"description": "", "measures": "", "targets": "", "remarks":""}]
            Requirement note:
            - description max 400
            - measures, targets, and remarks max 150
            `;

      if (dto.debug) {
        return { prompts: [prompt] };
      }

      const resultText = await withAiRetry(() =>
        this.aiService.generateInitiativesFromPrompt(ctx, prompt),
      );

      const initiatives: Initiative[] = [];

      for (const entry of resultText) {
        const initiative = new Initiative();
        initiative.initiativeNumber = minInitiativeNumber; // assign initiativeNumber
        initiative.description = entry.description;
        initiative.measures = entry.measures;
        initiative.targets = entry.targets;
        initiative.remarks = entry.remarks;
        initiative.rns = rns;
        initiative.isAiGenerated = false;
        initiative.startup = rns.startup;
        initiative.assignee = rns.startup.user;
        initiative.status = 1;
        initiative.priorityNumber = 0;
        initiative.requestedStatus = 1;
        initiative.generationRun = ctx.run;

        await this.em.persistAndFlush(initiative);
        initiatives.push(initiative);
      }
      await this.shiftInitiativeNumbers(
        existingInitiatives,
        initiatives.length > 0 ? 1 : 0,
      );

      return initiatives;
    } else {
      throw new BadRequestException('Either rnsId or rnsIds must be provided');
    }
  }

  /** Moves existing initiatives past the numbers new ones just took. */
  private async shiftInitiativeNumbers(existing: Initiative[], by: number) {
    if (by === 0 || existing.length === 0) return;
    for (const initiative of existing) initiative.initiativeNumber += by;
    await this.em.flush();
  }

  async refineInitiative(
    initiativeId: number,
    chatHistory: { role: 'User' | 'Ai'; content: string }[],
    latestPrompt: string,
    ctx: AiRunContext,
  ): Promise<{
    refinedDescription?: string;
    refinedMeasures?: string;
    refinedTargets?: string;
    refinedRemarks?: string;
    aiCommentary: string;
  }> {
    const initiative = await this.em.findOne(
      Initiative,
      { id: initiativeId },
      {
        populate: ['startup', 'startup.capsuleProposal', 'rns'],
      },
    );
    if (!initiative) throw new NotFoundException('Initiative not found');

    const startup = initiative.startup;
    // The refine route carries only the initiative id, so the run opens with
    // startupId: null. See generateInitiatives for why attribute() is needed.
    await this.aiRunService.attribute(ctx, startup);
    const capsuleProposalInfo = startup.capsuleProposal;
    if (!capsuleProposalInfo)
      throw new BadRequestException(
        'No capsule proposal found for this startup.',
      );

    const basePrompt = await this.aiService.createBasePrompt(ctx, startup, this.em);

    const prompt = `${basePrompt}

        Current Initiative Details:
        Description: ${initiative.description}
        Measures: ${initiative.measures}
        Targets: ${initiative.targets}
        Remarks: ${initiative.remarks}
        
        Related RNS Task:
        ${initiative.rns.description}

        Chat History:
        ${chatHistory.map((msg) => `${msg.role}: ${msg.content}`).join('\n')}

        User: ${latestPrompt}

        IMPORTANT INSTRUCTIONS:
        1. Only refine the specific fields that the user explicitly asks to modify
        2. Do not modify any other fields
        3. Respond with a JSON object containing ONLY the requested refinements
        4. If the user asks for a change without naming a field, refine all fields.
           ${JSON_NO_CHANGE_RULE}
        5. Use the exact field names shown in the example
        6. You can use HTML formatting in your refined text:
           - <p> for paragraphs
           - <strong> for bold text
           - <em> for italic text
           - <u> for underline
           - <br> for line breaks
           - • for bullet points
           Example: <p><strong>Key Point</strong>: This is <em>important</em> information.</p>

        Example response format:
        If user asks to update measures only:
        {
            "refinedMeasures": "your refined measures here"
        }
        =========
        Your commentary about the changes here.

        If user asks to update description and targets:
        {
            "refinedDescription": "your refined description here",
            "refinedTargets": "your refined targets here"
        }
        =========
        Your commentary about the changes here.

        Available fields:
        - refinedDescription (for description updates)
        - refinedMeasures (for measures updates)
        - refinedTargets (for targets updates)
        - refinedRemarks (for remarks updates)

        Remember:
        - Only include fields that the user specifically asks to refine
        - The JSON must be valid and properly formatted
        - Always include the ========= separator followed by your commentary
        - DO NOT MENTION THE FORMATTING INSTRUCTIONS OR HOW YOU FORMATTED THE RESPONSE IN THE COMMENTARY.`;

    const result = await this.aiService.refineInitiative(ctx, prompt);

    const newMessages = [
      new InitiativeChatHistory({
        initiative,
        role: 'User',
        content: latestPrompt,
      }),
      new InitiativeChatHistory({
        initiative,
        role: 'Ai',
        content: result.aiCommentary,
        refinedDescription: result.refinedDescription,
        refinedMeasures: result.refinedMeasures,
        refinedTargets: result.refinedTargets,
        refinedRemarks: result.refinedRemarks,
      }),
    ];

    await this.em.persistAndFlush(newMessages);

    return result;
  }
}
