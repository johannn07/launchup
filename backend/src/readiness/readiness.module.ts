import { Module } from '@nestjs/common';
import { ReadinessService } from './readiness.service';
import { ReadinessController } from './readiness.controller';
import { WeightProfileService } from './weight-profile.service';

@Module({
  providers: [ReadinessService, WeightProfileService],
  controllers: [ReadinessController],
  exports: [ReadinessService, WeightProfileService],
})
export class ReadinessModule {}
