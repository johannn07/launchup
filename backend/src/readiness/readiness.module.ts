import { Module } from '@nestjs/common';
import { ReadinessService } from './readiness.service';
import { ReadinessController } from './readiness.controller';
import { WeightProfileService } from './weight-profile.service';
import { ConfigAlertService } from './config-alert.service';

@Module({
  providers: [ReadinessService, WeightProfileService, ConfigAlertService],
  controllers: [ReadinessController],
  exports: [ReadinessService, WeightProfileService],
})
export class ReadinessModule {}
