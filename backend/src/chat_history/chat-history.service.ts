import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { RnsChatHistory } from '../entities/rns-chat-history.entity';
import { InitiativeChatHistory } from '../entities/initiative-chat-history.entity';
import { RoadblockChatHistory } from '../entities/roadblock-chat-history.entity';
import { RnaChatHistory } from '../entities/rna-chat-history.entity';
import { Rns } from '../entities/rns.entity';
import { Initiative } from '../entities/initiative.entity';
import { Roadblock } from '../entities/roadblock.entity';
import { StartupRNA } from '../entities/rna.entity';

@Injectable()
export class ChatHistoryService {
  constructor(private readonly em: EntityManager) {}

  async getRnsChatHistory(rnsId: number) {
    const chatHistory = await this.em.find(
      RnsChatHistory,
      { rns: { id: rnsId } },
      {
        orderBy: { createdAt: 'ASC' },
        populate: ['rns'],
      },
    );

    return chatHistory.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      refinedDescription: message.refinedDescription,
    }));
  }

  async getInitiativeChatHistory(initiativeId: number) {
    const chatHistory = await this.em.find(
      InitiativeChatHistory,
      { initiative: { id: initiativeId } },
      {
        orderBy: { createdAt: 'ASC' },
        populate: ['initiative'],
      },
    );

    return chatHistory.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      refinedDescription: message.refinedDescription,
      refinedMeasures: message.refinedMeasures,
      refinedTargets: message.refinedTargets,
      refinedRemarks: message.refinedRemarks,
    }));
  }

  async getRoadblockChatHistory(roadblockId: number) {
    const chatHistory = await this.em.find(
      RoadblockChatHistory,
      { roadblock: { id: roadblockId } },
      {
        orderBy: { createdAt: 'ASC' },
        populate: ['roadblock'],
      },
    );

    return chatHistory.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      refinedDescription: message.refinedDescription,
      refinedFix: message.refinedFix,
    }));
  }

  async getRnaChatHistory(rnaId: number) {
    const chatHistory = await this.em.find(
      RnaChatHistory,
      { rna: { id: rnaId } },
      {
        orderBy: { createdAt: 'ASC' },
        populate: ['rna'],
      },
    );

    return chatHistory.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      refinedRna: message.refinedRna,
    }));
  }

  async getRnsWithStartup(rnsId: number) {
    const rns = await this.em.findOne(Rns, { id: rnsId }, { populate: ['startup'] });
    if (!rns) throw new NotFoundException(`RNS with ID ${rnsId} not found`);
    return rns;
  }

  async getInitiativeWithStartup(initiativeId: number) {
    const initiative = await this.em.findOne(Initiative, { id: initiativeId }, { populate: ['startup'] });
    if (!initiative) throw new NotFoundException(`Initiative with ID ${initiativeId} not found`);
    return initiative;
  }

  async getRoadblockWithStartup(roadblockId: number) {
    const roadblock = await this.em.findOne(Roadblock, { id: roadblockId }, { populate: ['startup'] });
    if (!roadblock) throw new NotFoundException(`Roadblock with ID ${roadblockId} not found`);
    return roadblock;
  }

  async getRnaWithStartup(rnaId: number) {
    const rna = await this.em.findOne(StartupRNA, { id: rnaId }, { populate: ['startup'] });
    if (!rna) throw new NotFoundException(`RNA with ID ${rnaId} not found`);
    return rna;
  }
}
