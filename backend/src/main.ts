import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { EntityManager, MikroORM } from '@mikro-orm/core';
import { hash } from 'argon2';
import { User } from './entities/user.entity';
import { Startup } from './entities/startup.entity';
import { ReadinessLevel } from './entities/readiness-level.entity';
import { StartupReadinessLevel } from './entities/startup-readiness-level.entity';
import { QualificationStatus } from './entities/enums/qualification-status.enum';
import { Role } from './entities/enums/role.enum';
import { ReadinessType } from './entities/enums/readiness-type.enum';
import { EmbeddingIndexService } from './ai/embedding-index.service';

async function ensureUser(
  em: EntityManager,
  passwordHash: string,
  email: string,
  firstName: string,
  lastName: string,
  role: Role,
): Promise<User> {
  let user = await em.findOne(User, { email });
  if (!user) {
    user = em.create(User, {
      email,
      hash: passwordHash,
      firstName,
      lastName,
      role,
    });
    em.persist(user);
  }
  return user;
}

async function seedLocalDemoData(orm: MikroORM) {
  const em = orm.em.fork();

  const demoPasswordHash = await hash('password123');
  const ensure = (
    email: string,
    firstName: string,
    lastName: string,
    role: Role,
  ) => ensureUser(em, demoPasswordHash, email, firstName, lastName, role);

  await ensure('demo@launchup.local', 'Demo', 'Founder', Role.Startup);
  await ensure('admin@launchup.local', 'Demo', 'Admin', Role.Admin);
  await ensure('manager@launchup.local', 'Demo', 'Manager', Role.Manager);
  const mentorUser = await ensure(
    'mentor@launchup.local',
    'Demo',
    'Mentor',
    Role.Mentor,
  );

  // A startup is owned by its founder — a Startup-role account. Staff accounts
  // (manager/mentor) must never be the `user` owner, and a mentor must never be
  // assigned to a startup they own. Each demo startup gets its own founder.
  const agroFounder = await ensure(
    'founder.agrolink@launchup.local',
    'Rafael',
    'Domingo',
    Role.Startup,
  );
  const mediFounder = await ensure(
    'founder.medisync@launchup.local',
    'Elena',
    'Reyes',
    Role.Startup,
  );

  const readinessSeeds = [
    {
      level: 3,
      name: 'Team traction baseline',
      readinessType: ReadinessType.A,
    },
    {
      level: 4,
      name: 'Market validation baseline',
      readinessType: ReadinessType.M,
    },
    {
      level: 2,
      name: 'Product maturity baseline',
      readinessType: ReadinessType.T,
    },
    { level: 3, name: 'Execution baseline', readinessType: ReadinessType.O },
    { level: 1, name: 'Funding baseline', readinessType: ReadinessType.I },
  ];

  for (const seed of readinessSeeds) {
    const existing = await em.findOne(ReadinessLevel, {
      readinessType: seed.readinessType,
      level: seed.level,
    });

    if (!existing) {
      em.persist(
        em.create(ReadinessLevel, {
          level: seed.level,
          name: seed.name,
          readinessType: seed.readinessType,
        }),
      );
    }
  }

  await em.flush();

  // Commented out to prevent auto-seeding the demo startup per user request
  /*
  let demoStartup = await em.findOne(Startup, {
    user: { id: demoUser.id },
  });

  if (!demoStartup) {
    demoStartup = em.create(Startup, {
      name: 'LaunchUp Demo Startup',
      user: demoUser,
      qualificationStatus: QualificationStatus.PENDING,
      dataPrivacy: true,
      eligibility: true,
    });
    em.persist(demoStartup);
    await em.flush();
    demoStartup.members.add(demoUser);
    await em.flush();
  }

  const readinessLevels = await em.find(ReadinessLevel, {});
  const readinessLevelByType = new Map(
    readinessLevels.map((level) => [level.readinessType, level]),
  );

  for (const readinessType of [
    ReadinessType.A,
    ReadinessType.M,
    ReadinessType.T,
    ReadinessType.O,
    ReadinessType.I,
  ]) {
    const readinessLevel = readinessLevelByType.get(readinessType);
    if (!readinessLevel) continue;

    const existingLink = await em.findOne(StartupReadinessLevel, {
      startup: { id: demoStartup.id },
      readinessLevel: { id: readinessLevel.id },
    });

    if (!existingLink) {
      em.persist(
        em.create(StartupReadinessLevel, {
          startup: demoStartup,
          readinessLevel,
          remark: 'Seeded local demo readiness data',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
    }
  }
  */
  // The original startup initialization remains unmodified
  // After ensuring baseline readiness levels and users, seed the demo startups
  await seedDemoStartups(orm, mentorUser, agroFounder, mediFounder);
}

async function ensureReadinessLevelExists(
  em: EntityManager,
  readinessType: ReadinessType,
  level: number,
) {
  let rl = await em.findOne(ReadinessLevel, { readinessType, level });
  if (!rl) {
    rl = em.create(ReadinessLevel, {
      level,
      name: `Seeded ${readinessType} level ${level}`,
      readinessType,
    });
    em.persist(rl);
    await em.flush();
  }
  return rl;
}

async function seedDemoStartup(
  em: EntityManager,
  spec: {
    name: string;
    founder: User;
    mentor: User;
    links: Record<string, unknown>;
    levels: [ReadinessType, number][];
  },
) {
  const existing = await em.findOne(Startup, { name: spec.name });
  if (existing) {
    // Guarded, so an already-seeded startup is never rewritten. If an older
    // boot left one owned by a staff account, run `node seed-demo-full.js` to
    // repair it — this seeder deliberately does not mutate existing rows.
    console.log(`${spec.name} already exists id=`, existing.id);
    return;
  }

  const startup = em.create(Startup, {
    name: spec.name,
    user: spec.founder,
    qualificationStatus: QualificationStatus.PENDING,
    dataPrivacy: true,
    eligibility: true,
    links: JSON.stringify(spec.links),
  });
  em.persist(startup);
  await em.flush();

  startup.members.add(spec.founder);
  // What `appoint-mentors` does after a Manager approves the applicant. Seeding
  // the startup without it leaves it mentorless, which reads as the Manager
  // doing the mentor's work.
  startup.mentors.add(spec.mentor);
  await em.flush();

  for (const [type, level] of spec.levels) {
    const readinessLevel = await ensureReadinessLevelExists(em, type, level);
    const existingLink = await em.findOne(StartupReadinessLevel, {
      startup: { id: startup.id },
      readinessLevel: { id: readinessLevel.id },
    });
    if (!existingLink) {
      em.persist(
        em.create(StartupReadinessLevel, {
          startup,
          readinessLevel,
          remark: `Seeded baseline for ${spec.name}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
    }
  }
  await em.flush();
  console.log(`Seeded startup ${spec.name} id=`, startup.id);
}

async function seedDemoStartups(
  orm: MikroORM,
  mentorUser: User,
  agroFounder: User,
  mediFounder: User,
) {
  const em = orm.em.fork();

  // AgroLink PH (early stage)
  await seedDemoStartup(em, {
    name: 'AgroLink PH',
    founder: agroFounder,
    mentor: mentorUser,
    links: { team: '2 founders', revenue: 0, sector: 'agritech' },
    levels: [
      [ReadinessType.T, 2],
      [ReadinessType.M, 2],
      [ReadinessType.A, 1],
      [ReadinessType.O, 2],
      [ReadinessType.R, 1],
      [ReadinessType.I, 1],
    ],
  });

  // MediSync Cebu (mid stage)
  await seedDemoStartup(em, {
    name: 'MediSync Cebu',
    founder: mediFounder,
    mentor: mentorUser,
    links: { team: '3 founders', revenue: 5000, sector: 'healthtech' },
    levels: [
      [ReadinessType.T, 5],
      [ReadinessType.M, 4],
      [ReadinessType.A, 3],
      [ReadinessType.O, 4],
      [ReadinessType.R, 3],
      [ReadinessType.I, 3],
    ],
  });
}

/**
 * Embed any rag_contexts row that has no vector yet.
 *
 * Runs on boot for the same reason the schema sync and demo seed do: this
 * database is developer-local and self-assembling. rag_contexts has been
 * written since long before anything embedded it, so without this every
 * existing row is invisible to semantic retrieval and the feature looks broken
 * rather than unindexed.
 *
 * Idempotent — it only selects rows with no vector, so a second boot costs no
 * API calls. Failures are logged and swallowed: an unreachable embedding API
 * degrades retrieval, but it must not stop the server from starting.
 */
async function backfillRagEmbeddings(app: NestExpressApplication) {
  try {
    const result = await app.get(EmbeddingIndexService).backfill();
    if (result.total > 0) {
      console.log(
        `RAG embeddings: indexed ${result.indexed}/${result.total} contexts` +
          (result.skipped ? ` (${result.skipped} skipped)` : ''),
      );
    }
  } catch (error) {
    console.error(
      'RAG embedding backfill failed; semantic retrieval will be degraded:',
      error instanceof Error ? error.message : error,
    );
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'https://launchup.onrender.com',
      'https://launchup.vercel.app',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const orm = app.get(MikroORM);
  await orm.getSchemaGenerator().updateSchema();
  await seedLocalDemoData(orm);
  await backfillRagEmbeddings(app);

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on port ${port}`);
}

bootstrap().catch(console.error);
