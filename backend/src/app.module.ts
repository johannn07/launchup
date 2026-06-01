import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { StartupModule } from './startup/startup.module';
import { ReadinesslevelModule } from './readinesslevel/readinesslevel.module';
import { ReadinessModule } from './readiness/readiness.module';
import { AiModule } from './ai/ai.module';
import { BaselineModule } from './ai/baseline.module';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';   // added
import { ChatHistoryModule } from './chat_history/chat-history.module';
import { AdminModule } from './admin/admin.module';
import { User } from './entities/user.entity';
import { Startup } from './entities/startup.entity';
import { CapsuleProposal } from './entities/capsule-proposal.entity';
import { UratQuestion } from './entities/urat-question.entity';
import { RnaChatHistory } from './entities/rna-chat-history.entity';
import { AppController } from './app.controller';
import { RoadblockModule } from './roadblock/roadblock.module';
import { RnaModule } from './rna/rna.module';
import { RnsModule } from './rns/rns.module';
import { InitiativeModule } from './initiative/initiative.module';
import { ProgressModule } from './progress/progress.module';
import { OverviewModule } from './overview/overview.module';
import { ElevateModule } from './elevate/elevate.module';
import { AssessmentModule } from './assessment/assessment.module';
import { OcrModule } from './ocr/ocr.module';
import { UploadModule } from './upload/upload.module';

// New entities and custom type
import { Recommendation } from './entities/recommendation.entity';
import { RagRetrievalLog } from './entities/rag-retrieval-log.entity';
import { VectorEmbedding } from './entities/vector-embeddings.entity'; // if you plan to use it

import config from './mikro-orm.config';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MikroOrmModule.forRoot(config as any),
    MikroOrmModule.forFeature({
      entities: [
        User,
        Startup,
        CapsuleProposal,
        UratQuestion,
        RnaChatHistory,
        Recommendation,        // new
        RagRetrievalLog,        // new
        VectorEmbedding,        // new (optional)
      ],
    }),
    AiModule,
    AuthModule,
    StartupModule,
    UserModule,
    ReadinesslevelModule,
    ReadinessModule,
    RnaModule,
    RnsModule,
    InitiativeModule,
    RoadblockModule,
    ProgressModule,
    OverviewModule,
    ChatHistoryModule,
    ElevateModule,
    UploadModule,
    AdminModule,
    AssessmentModule,
    OcrModule,
    BaselineModule,
  ],
  providers: [AppService],
})
export class AppModule {}