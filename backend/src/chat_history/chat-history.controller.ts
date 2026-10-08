import { Controller, Get, Param, ParseIntPipe, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { ChatHistoryService } from './chat-history.service';
import { StartupService } from '../startup/startup.service';
import { Rns } from '../entities/rns.entity';
import { Initiative } from '../entities/initiative.entity';
import { Roadblock } from '../entities/roadblock.entity';
import { StartupRNA } from '../entities/rna.entity';

// These return full AI conversation transcripts, which contain the startup's
// business details. The guard was commented out; there is no reason it should
// be, so it is back on.
@UseGuards(JwtGuard)
@Controller('chat-history')
export class ChatHistoryController {
  constructor(
    private chatHistoryService: ChatHistoryService,
    private readonly startupService: StartupService,
  ) {}

  private async assertAccess(entity: { startup: { id: number } | number }, req: any) {
    const startupId = typeof entity.startup === 'number' ? entity.startup : entity.startup.id;
    await this.startupService.assertCanAccessStartup(startupId, req.user);
  }

  @Get('rns/:id')
  async getRnsChatHistory(@Param('id', ParseIntPipe) rnsId: number, @Req() req: any) {
    const rns = await this.chatHistoryService.getRnsWithStartup(rnsId);
    await this.assertAccess(rns, req);
    return await this.chatHistoryService.getRnsChatHistory(rnsId);
  }

  @Get('initiatives/:id')
  async getInitiativeChatHistory(
    @Param('id', ParseIntPipe) initiativeId: number,
    @Req() req: any,
  ) {
    const initiative = await this.chatHistoryService.getInitiativeWithStartup(initiativeId);
    await this.assertAccess(initiative, req);
    return await this.chatHistoryService.getInitiativeChatHistory(initiativeId);
  }

  @Get('roadblocks/:id')
  async getRoadblockChatHistory(
    @Param('id', ParseIntPipe) roadblockId: number,
    @Req() req: any,
  ) {
    const roadblock = await this.chatHistoryService.getRoadblockWithStartup(roadblockId);
    await this.assertAccess(roadblock, req);
    return await this.chatHistoryService.getRoadblockChatHistory(roadblockId);
  }

  @Get('rna/:id')
  async getRnaChatHistory(@Param('id', ParseIntPipe) rnaId: number, @Req() req: any) {
    const rna = await this.chatHistoryService.getRnaWithStartup(rnaId);
    await this.assertAccess(rna, req);
    return await this.chatHistoryService.getRnaChatHistory(rnaId);
  }
}
