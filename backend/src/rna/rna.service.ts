import { EntityManager } from '@mikro-orm/core';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StartupRNA } from 'src/entities/rna.entity';
import { Startup } from 'src/entities/startup.entity';
import { CreateStartupRnaDto, UpdateStartupRnaDto } from './dto/rna.dto';
import { ReadinessLevel } from 'src/entities/readiness-level.entity';
import { StartupReadinessLevel } from 'src/entities/startup-readiness-level.entity';
import { AiService } from 'src/ai/ai.service';
import { RagQueryService } from './rag-query.service';
import { GroundedPromptBuilderService } from './grounded-prompt-builder.service';
import { OutputValidatorService } from './output-validator.service';
import { RecommendationStorageService } from './recommendation-storage.service';
import { RnaChatHistory } from 'src/entities/rna-chat-history.entity';
import { AiRunContext, AiRunService } from '../ai/ai-run.service';
import { RNA_MAX_LENGTH } from './rna.constants';

@Injectable()
export class RnaService {
  constructor(
    private em: EntityManager,
    private readonly aiService: AiService,
    private readonly ragQueryService: RagQueryService,
    private readonly groundedPromptBuilderService: GroundedPromptBuilderService,
    private readonly outputValidatorService: OutputValidatorService,
    private readonly recommendationStorageService: RecommendationStorageService,
    private readonly aiRunService: AiRunService,
  ) {}

  async getRNAbyId(startupId: number) {
    return await this.em.find(
      StartupRNA,
      { startup: startupId },
      {
        populate: ['readinessLevel'],
      },
    );
  }

  async create(dto: CreateStartupRnaDto) {
    if (!dto.readiness_level_id) {
      throw new BadRequestException('readiness_level_id is required');
    }

    const readinessRef = this.em.getReference(
      ReadinessLevel,
      dto.readiness_level_id,
    );
    const startupRef = this.em.getReference(Startup, dto.startup_id);

    const rna = this.em.create(StartupRNA, {
      rna: dto.rna,
      isAiGenerated: dto.isAiGenerated ?? false,
      startup: startupRef,
      readinessLevel: readinessRef,
    });

    await this.em.persistAndFlush(rna);
    return rna;
  }

  async update(id: number, dto: UpdateStartupRnaDto) {
    const rna = await this.em.findOneOrFail(StartupRNA, { id });

    if (dto.rna !== undefined) {
      rna.rna = dto.rna;
    }

    if (dto.isAiGenerated !== undefined) {
      rna.isAiGenerated = dto.isAiGenerated;
    }

    await this.em.flush();
    return rna;
  }

  async delete(id: number) {
    const rna = await this.em.findOne(StartupRNA, { id });
    if (!rna) throw new NotFoundException(`RNA with ID ${id} not found`);

    await this.em.removeAndFlush(rna);
    return rna;
  }

  async generateRNA(id: number, ctx: AiRunContext) {
    const startup = await this.em.findOne(
      Startup,
      { id: id },
      {
        populate: ['capsuleProposal'],
      },
    );
    if (!startup) throw new NotFoundException('Startup not found');

    const capsuleProposalInfo = startup.capsuleProposal;
    if (!capsuleProposalInfo)
      throw new BadRequestException('No capsule proposal found.');

    const existingRNAs = await this.em.find(
      StartupRNA,
      { startup: startup },
      {
        populate: ['readinessLevel'],
      },
    );

    const startupReadinessLevels = await this.em.find(
      StartupReadinessLevel,
      { startup: startup },
      { populate: ['readinessLevel'] },
    );

    // Generation only fills gaps; existing RNAs are never regenerated.
    const readinessLevelsWithoutRNA = startupReadinessLevels.filter(
      (startupReadinessLevel) =>
        !existingRNAs.some(
          (existingRNA) =>
            existingRNA.readinessLevel.id ===
            startupReadinessLevel.readinessLevel.id,
        ),
    );

    if (readinessLevelsWithoutRNA.length === 0) {
      return [];
    }

    const ragContext = await this.ragQueryService.queryVectorDatabase(id.toString(), {
      config: ctx.config,
      dimensions: readinessLevelsWithoutRNA.map((srl) => ({
        readinessType: srl.readinessLevel.readinessType,
        level: srl.readinessLevel.level,
      })),
    });

    const startupProfile = {
      ...capsuleProposalInfo,
      readinessLevels: startupReadinessLevels.map((srl) => ({
        type: srl.readinessLevel.readinessType,
        level: srl.readinessLevel.level,
      })),
    };

    // Negate the flag rather than restating "do we have context?" — RNS's
    // equivalent guard drifted out of step precisely by doing that.
    let prompt: string;
    if (!ragContext.lowConfidence) {
      const missingTypes = readinessLevelsWithoutRNA.map(
        (rl) => rl.readinessLevel.readinessType,
      );
      prompt = this.groundedPromptBuilderService.buildGroundedPrompt(
        ragContext,
        startupProfile,
        missingTypes,
      );
    } else {
      // rubricMode passed through so a low-confidence semantic result doesn't
      // pick up the deterministic lookup and get relabelled as the semantic
      // arm. See createBasePrompt's opts JSDoc.
      const basePrompt = await this.aiService.createBasePrompt(ctx, startup, this.em, {
        rubricMode: ctx.config.rubricMode,
      });
      if (!basePrompt) {
        throw new BadRequestException('No capsule proposal found for this startup');
      }
      prompt = `${basePrompt}\n\nTASK: Generate a Readiness and Needs Assessment (RNA) for: ${readinessLevelsWithoutRNA
        .map((srl) => srl.readinessLevel.readinessType)
        .join(', ')}.\nRespond with a JSON array: [{"readiness_level_type": (string), "rna": (string, max ${RNA_MAX_LENGTH} chars)}]`;
    }

    const generatedRNAs = await this.aiService.generateRNAsFromPrompt(ctx, prompt);
    console.log('AI generatedRNAs:', JSON.stringify(generatedRNAs, null, 2));

    const createdRNAs: StartupRNA[] = [];
    for (const generatedRNA of generatedRNAs) {
      const matchingReadinessLevel = readinessLevelsWithoutRNA.find(
        (rl) =>
          rl.readinessLevel.readinessType === generatedRNA.readiness_level_type,
      );

      if (matchingReadinessLevel && generatedRNA.rna?.trim()) {
        const newRNA = new StartupRNA();
        newRNA.rna = generatedRNA.rna.trim();
        // `true` here, unlike the RNS/initiative/roadblock generators: the RNA
        // page renders every row regardless, so this only drives the dialog's
        // "AI Generated" label. `false` would also make addToRNA's
        // same-readiness-type lookup match this row against itself, deleting it
        // and then PATCHing a deleted id.
        newRNA.isAiGenerated = true;
        newRNA.startup = startup;
        newRNA.readinessLevel = matchingReadinessLevel.readinessLevel;
        newRNA.generationRun = ctx.run;

        await this.em.persist(newRNA);
        createdRNAs.push(newRNA);

        const verdict = this.outputValidatorService.validate({
          content: newRNA.rna,
          retrievalLowConfidence: ragContext.lowConfidence,
          maxLength: RNA_MAX_LENGTH,
        });

        await this.aiService.recordAiRecommendation({
          startupId: startup.id,
          dimensionKey: matchingReadinessLevel.readinessLevel.readinessType,
          recommendationKind: 'RNA',
          content: newRNA.rna,
          validationStatus: verdict.validationStatus,
          confidenceStatus: verdict.confidenceStatus,
          notes: verdict.notes,
          generationRun: ctx.run,
        });
      }
    }
    await this.em.flush();

    return createdRNAs.map((r: StartupRNA) => ({
      id: r.id,
      rna: r.rna,
      isAiGenerated: r.isAiGenerated,
      startup: r.startup,
      readinessLevel: r.readinessLevel,
    }));
  }

  async checkIfAllReadinessTypesHaveRNA(startupId: number): Promise<boolean> {
    const startup = await this.em.findOne(Startup, { id: startupId });
    if (!startup) throw new NotFoundException('Startup not found');

    const startupReadinessLevels = await this.em.find(
      StartupReadinessLevel,
      { startup: startup },
      { populate: ['readinessLevel'] },
    );

    const existingRNAs = await this.em.find(
      StartupRNA,
      { startup: startup },
      {
        populate: ['readinessLevel'],
      },
    );

    return startupReadinessLevels.every((startupReadinessLevel) =>
      existingRNAs.some(
        (existingRNA) =>
          existingRNA.readinessLevel.id ===
          startupReadinessLevel.readinessLevel.id,
      ),
    );
  }

  async refineRna(
    rnaId: number,
    chatHistory: { role: 'User' | 'Ai'; content: string }[],
    latestPrompt: string,
    ctx: AiRunContext,
  ): Promise<{
    refinedRna?: string;
    aiCommentary: string;
  }> {
    const rna = await this.em.findOne(
      StartupRNA,
      { id: rnaId },
      {
        populate: ['startup', 'startup.capsuleProposal', 'readinessLevel'],
      },
    );
    if (!rna) throw new NotFoundException('RNA not found');

    const startup = rna.startup;
    // The refine route carries only the RNA id, so the run opens with
    // startupId: null. See AiRunService.attribute for why a bare assignment
    // would be discarded here.
    await this.aiRunService.attribute(ctx, startup);
    const capsuleProposalInfo = startup.capsuleProposal;
    if (!capsuleProposalInfo)
      throw new BadRequestException(
        'No capsule proposal found for this startup.',
      );

    const basePrompt = await this.aiService.createBasePrompt(ctx, startup, this.em);

    const prompt = `${basePrompt}

      Current RNA Details:
      Readiness Type: ${rna.readinessLevel.readinessType}
      Current Level: ${rna.readinessLevel.level}
      RNA Description: ${rna.rna}

      Chat History:
      ${chatHistory.map((msg) => `${msg.role}: ${msg.content}`).join('\n')}

      User: ${latestPrompt}

      IMPORTANT INSTRUCTIONS:
      1. Only refine the RNA description that the user explicitly asks to modify
      2. Do not modify any other fields
      3. Respond with a JSON object containing ONLY the requested refinements
      4. If the user did not specify what to refine, refine the RNA description
      5. Use the exact field name shown in the example
      6. You can use HTML formatting in your refined text:
         - <p> for paragraphs
         - <strong> for bold text
         - <em> for italic text
         - <u> for underline
         - <br> for line breaks
         - Use • (bullet character) for bullet points
         Example: <p><strong>Key Point</strong>: This is <em>important</em> information.</p>
         Example with bullets: <p>• First point<br>• Second point<br>• Third point</p>

      Example response format:
      {
          "refinedRna": "your refined RNA description here"
      }
      =========
      Your commentary about the changes here.

      Available fields:
      - refinedRna (for RNA description updates)

      Remember:
      - Only include the refinedRna field if the user specifically asks to refine the RNA description
      - The JSON must be valid and properly formatted
      - Always include the ========= separator followed by your commentary
      - DO NOT MENTION THE FORMATTING INSTRUCTIONS OR HOW YOU FORMATTED THE RESPONSE IN THE COMMENTARY.`;

    const result = await this.aiService.refineRna(ctx, prompt);

    const newMessages = [
      new RnaChatHistory({
        rna,
        role: 'User',
        content: latestPrompt,
      }),
      new RnaChatHistory({
        rna,
        role: 'Ai',
        content: result.aiCommentary,
        refinedRna: result.refinedRna,
      }),
    ];

    await this.em.persistAndFlush(newMessages);

    return result;
  }
}
