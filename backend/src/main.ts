import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { MikroORM } from '@mikro-orm/core';
import { hash } from 'argon2';
import { User } from './entities/user.entity';
import { Startup } from './entities/startup.entity';
import { ReadinessLevel } from './entities/readiness-level.entity';
import { StartupReadinessLevel } from './entities/startup-readiness-level.entity';
import { QualificationStatus } from './entities/enums/qualification-status.enum';
import { Role } from './entities/enums/role.enum';
import { ReadinessType } from './entities/enums/readiness-type.enum';
import { CapsuleProposal } from './entities/capsule-proposal.entity';

async function seedLocalDemoData(orm: MikroORM) {
  const em = orm.em.fork();

  const demoPasswordHash = await hash('password123');

  let demoUser = await em.findOne(User, { email: 'demo@launchup.local' });
  if (!demoUser) {
    demoUser = em.create(User, {
      email: 'demo@launchup.local',
      hash: demoPasswordHash,
      firstName: 'Demo',
      lastName: 'Founder',
      role: Role.Startup,
    });
    em.persist(demoUser);
  }

  let adminUser = await em.findOne(User, { email: 'admin@launchup.local' });
  if (!adminUser) {
    adminUser = em.create(User, {
      email: 'admin@launchup.local',
      hash: demoPasswordHash,
      firstName: 'Demo',
      lastName: 'Admin',
      role: Role.Admin,
    });
    em.persist(adminUser);
  }

  let managerUser = await em.findOne(User, { email: 'manager@launchup.local' });
  if (!managerUser) {
    managerUser = em.create(User, {
      email: 'manager@launchup.local',
      hash: demoPasswordHash,
      firstName: 'Demo',
      lastName: 'Manager',
      role: Role.Manager,
    });
    em.persist(managerUser);
  }

  let mentorUser = await em.findOne(User, { email: 'mentor@launchup.local' });
  if (!mentorUser) {
    mentorUser = em.create(User, {
      email: 'mentor@launchup.local',
      hash: demoPasswordHash,
      firstName: 'Demo',
      lastName: 'Mentor',
      role: Role.Mentor,
    });
    em.persist(mentorUser);
  }

  const readinessSeeds = [
    { level: 3, name: 'Team traction baseline', readinessType: ReadinessType.A },
    { level: 4, name: 'Market validation baseline', readinessType: ReadinessType.M },
    { level: 2, name: 'Product maturity baseline', readinessType: ReadinessType.T },
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
  await seedDemoStartups(orm, demoUser, adminUser, managerUser, mentorUser);
}

async function ensureReadinessLevelExists(em, readinessType, level) {
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

async function seedDemoStartups(orm: MikroORM, demoUser: User, adminUser: User, managerUser: User, mentorUser: User) {
  const em = orm.em.fork();

  // AgroLink PH (early stage)
  let agro = await em.findOne(Startup, { name: 'AgroLink PH' });
  if (!agro) {
    agro = em.create(Startup, {
      name: 'AgroLink PH',
      user: managerUser,
      qualificationStatus: QualificationStatus.PENDING,
      dataPrivacy: true,
      eligibility: true,
      links: JSON.stringify({ team: '2 founders', revenue: 0, sector: 'agritech' }),
    });
    em.persist(agro);
    await em.flush();
    agro.members.add(managerUser);
    await em.flush();

    const agroLevels = [
      [ReadinessType.T, 2],
      [ReadinessType.M, 2],
      [ReadinessType.A, 1],
      [ReadinessType.O, 2],
      [ReadinessType.R, 1],
      [ReadinessType.I, 1],
    ];

    for (const [type, level] of agroLevels) {
      const readinessLevel = await ensureReadinessLevelExists(em, type, level);
      const existingLink = await em.findOne(StartupReadinessLevel, {
        startup: { id: agro.id },
        readinessLevel: { id: readinessLevel.id },
      });
      if (!existingLink) {
        em.persist(
          em.create(StartupReadinessLevel, {
            startup: agro,
            readinessLevel,
            remark: 'Seeded baseline for AgroLink PH',
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        );
      }
    }
    await em.flush();
    console.log('Seeded startup AgroLink PH id=', agro.id);
  } else {
    console.log('AgroLink PH already exists id=', agro.id);
  }

  // MediSync Cebu (mid stage)
  let medi = await em.findOne(Startup, { name: 'MediSync Cebu' });
  if (!medi) {
    medi = em.create(Startup, {
      name: 'MediSync Cebu',
      user: mentorUser,
      qualificationStatus: QualificationStatus.PENDING,
      dataPrivacy: true,
      eligibility: true,
      links: JSON.stringify({ team: '3 founders', revenue: 5000, sector: 'healthtech' }),
    });
    em.persist(medi);
    await em.flush();
    medi.members.add(mentorUser);
    await em.flush();

    const mediLevels = [
      [ReadinessType.T, 5],
      [ReadinessType.M, 4],
      [ReadinessType.A, 3],
      [ReadinessType.O, 4],
      [ReadinessType.R, 3],
      [ReadinessType.I, 3],
    ];

    for (const [type, level] of mediLevels) {
      const readinessLevel = await ensureReadinessLevelExists(em, type, level);
      const existingLink = await em.findOne(StartupReadinessLevel, {
        startup: { id: medi.id },
        readinessLevel: { id: readinessLevel.id },
      });
      if (!existingLink) {
        em.persist(
          em.create(StartupReadinessLevel, {
            startup: medi,
            readinessLevel,
            remark: 'Seeded baseline for MediSync Cebu',
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        );
      }
    }
    await em.flush();
    console.log('Seeded startup MediSync Cebu id=', medi.id);
  } else {
    console.log('MediSync Cebu already exists id=', medi.id);
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

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on port ${port}`);
}

bootstrap().catch(console.error);
