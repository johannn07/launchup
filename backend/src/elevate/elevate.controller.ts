import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { ElevateService } from './elevate.service';
import { ElevateStartupDto } from './dto';

@UseGuards(JwtGuard)
@Controller('elevate')
export class ElevateController {
  constructor(private elevateService: ElevateService) {}

  @Post()
  async elevateStartupReadinessLevel(@Body() dto: ElevateStartupDto) {
    return await this.elevateService.elevate(dto);
  }

  @Get(':id')
  async getStartupElevateLogs(@Param('id', ParseIntPipe) startupId: number) {
    return await this.elevateService.getStartupElevateLogs(startupId);
  }
}
