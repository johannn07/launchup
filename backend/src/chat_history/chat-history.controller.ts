import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { ChatHistoryService } from './chat-history.service';

// These return full AI conversation transcripts, which contain the startup's
// business details. The guard was commented out; there is no reason it should
// be, so it is back on.
@UseGuards(JwtGuard)
@Controller('chat-history')
export class ChatHistoryController {
  constructor(private chatHistoryService: ChatHistoryService) {}

  @Get('rns/:id')
  async getRnsChatHistory(@Param('id', ParseIntPipe) rnsId: number) {
    return await this.chatHistoryService.getRnsChatHistory(rnsId);
  }

  @Get('initiatives/:id')
  async getInitiativeChatHistory(
    @Param('id', ParseIntPipe) initiativeId: number,
  ) {
    return await this.chatHistoryService.getInitiativeChatHistory(initiativeId);
  }

  @Get('roadblocks/:id')
  async getRoadblockChatHistory(
    @Param('id', ParseIntPipe) roadblockId: number,
  ) {
    return await this.chatHistoryService.getRoadblockChatHistory(roadblockId);
  }

  @Get('rna/:id')
  async getRnaChatHistory(@Param('id', ParseIntPipe) rnaId: number) {
    return await this.chatHistoryService.getRnaChatHistory(rnaId);
  }
}
