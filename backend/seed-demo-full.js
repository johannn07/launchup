/**
 * Full demo seeder — makes every AI generation path exercisable from a clean DB.
 * Additive and idempotent.
 *
 *   pnpm build && node seed-demo-full.js
 *
 * main.ts's boot seeder creates the accounts and startups but no capsule
 * proposals, and only the readiness levels those startups sit at. Generation
 * needs both: it throws "No capsule proposal found" without one, and
 * generateTasks skips any target level with no ReadinessLevel row.
 *
 * The two startups are seeded differently so all four paths are testable:
 *   AgroLink PH   — proposal, no RNAs  -> RNA generation
 *   MediSync Cebu — proposal + 6 RNAs  -> RNS / initiative / roadblock
 *
 * Step 2 is a no-op on a fresh boot; it stays to *repair* Neon branches created
 * before 2026-07-27, where the older main.ts gave the startups to staff
 * accounts and assigned no mentor. That seeder is guarded on `if (existing)`
 * and never rewrites those rows.
 *
 * Only the four real roles are used — the frontend-only `Manager as Mentor`
 * pseudo-role is deliberately not exercised.
 */
const { MikroORM } = require('@mikro-orm/core');

process.chdir(__dirname);

// `nest build` emits to dist/src/ when a .ts sits at the backend root
// (seed-dummy.ts does), else dist/. Older seed-*.js hardcode ./dist/ and break.
const fs = require('fs');
const DIST = fs.existsSync(`${__dirname}/dist/src/mikro-orm.config.js`) ? './dist/src' : './dist';
const req = (p) => require(`${DIST}/${p}`);

// --check-levels reports the readiness-level corrections and exits without
// writing anything at all. The demo database is shared, so "what would this
// change" has to be answerable without changing it.
//
// Deliberately not called --dry-run: it does not make the whole seeder dry, and
// a flag that writes six other kinds of row while claiming to be a dry run is
// worse than no flag. It short-circuits before any other step.
const CHECK_LEVELS_ONLY = process.argv.includes('--check-levels');

const { DEMO_READINESS_LEVELS, SEEDED_LEVEL_REMARK } = req('demo-readiness-levels');

const ormConfigModule = req('mikro-orm.config');
const ormConfig = ormConfigModule.default || ormConfigModule;

// Emails and names must match main.ts's, or the two seeders fight over
// ownership and create duplicate founders.
const FOUNDERS = {
  'AgroLink PH': { email: 'founder.agrolink@launchup.local', firstName: 'Rafael', lastName: 'Domingo' },
  'MediSync Cebu': { email: 'founder.medisync@launchup.local', firstName: 'Elena', lastName: 'Reyes' },
};

const { DEMO_CAPSULE_PROPOSALS: PROPOSALS } = req('demo-capsule-proposals');

// One RNA per readiness type for MediSync, so RNS/initiative/roadblock
// generation has something to generate from immediately.
const MEDISYNC_RNAS = {
  Technology:
    'The platform is deployed at 6 facilities and handles live referrals, so the core stack is proven in the field. Not yet demonstrated: performance under province-wide load, and an offline mode for facilities with intermittent connectivity.',
  Market:
    'Six paying facilities and PHP 5,000 monthly recurring revenue establish real demand. The addressable market within Cebu is quantified, but pricing has not been tested against LGU procurement rules, which may cap what individual facilities can commit without a bidding process.',
  Acceptance:
    'Clinical staff at pilot sites use the system daily, indicating genuine workflow fit. Adoption beyond the pilot cohort is untested, and no structured training material exists for facilities onboarding without founder presence.',
  Organizational:
    'Three complementary founders cover clinical, engineering, and partnership functions. There is no hiring plan, no documented operational runbook, and delivery currently depends on all three founders remaining active.',
  Regulatory:
    'Health data handling falls under the Data Privacy Act. A compliance review is planned but not complete, and the processing system is not yet registered with the National Privacy Commission — this is the binding constraint on public-facility expansion.',
  Investment:
    'Operations are funded by founder capital and modest recurring revenue. There is no runway model, no external investment, and no articulated path from current revenue to sustainable operation at province scale.',
};

// Without these the assessment page renders nothing — including the File
// field, the only place uploads are exercised from the UI. `answerType` is the
// numeric AssessmentAnswerType (1 ShortAnswer, 2 LongAnswer, 3 File); the API
// reverse-maps it before the frontend sees it.
const ASSESSMENTS = [
  { type: 'Technology', answerType: 2, name: 'Describe the current state of your core technology', description: 'What is built, what is deployed, and what remains prototype?' },
  { type: 'Technology', answerType: 3, name: 'Upload your system architecture diagram', description: 'PDF or image. Handwritten sketches are acceptable.' },
  { type: 'Market', answerType: 2, name: 'Who is your target customer, and how did you validate that?', description: 'Cite interviews, pilots, or letters of intent.' },
  { type: 'Market', answerType: 3, name: 'Upload supporting market evidence', description: 'Survey results, signed LOIs, or pilot reports.' },
  { type: 'Organizational', answerType: 1, name: 'How many people work on this full-time?' },
  { type: 'Investment', answerType: 2, name: 'How are operations funded today?', description: 'Founder capital, grants, revenue, or external investment.' },
];

/**
 * Repoints demo readiness levels at the values derived from the capsule
 * proposals. main.ts's `if (existing) return;` means a cold-boot fix never
 * reaches a database that already holds these startups, so the repair lives
 * here.
 *
 * Only rewrites rows still carrying the seeder's own remark. A row a mentor has
 * graded says so in its remark, and silently replacing a rating with a seed
 * value would be worse than leaving it stale.
 *
 * `write: false` reports and touches nothing — no persist, no flush.
 */
async function correctReadinessLevels(em, entities, write) {
  const { Startup, StartupReadinessLevel, ReadinessLevel } = entities;
  let changed = 0;
  let skipped = 0;

  for (const [name, spec] of Object.entries(DEMO_READINESS_LEVELS)) {
    const startup = await em.findOne(Startup, { name });
    if (!startup) continue;

    const srls = await em.find(
      StartupReadinessLevel,
      { startup: startup },
      { populate: ['readinessLevel'] },
    );
    const seededRemark = SEEDED_LEVEL_REMARK(name);

    for (const [readinessType, wanted] of spec) {
      const row = srls.find((s) => s.readinessLevel.readinessType === readinessType);
      if (!row) {
        console.log(`  ${name}: ${readinessType} has no row - boot the backend first`);
        continue;
      }
      const current = row.readinessLevel.level;
      if (current === wanted) continue;

      if (row.remark !== seededRemark) {
        console.log(`  ${name}: ${readinessType} ${current} -> ${wanted} SKIPPED (remark is not the seeded one, treating as a real rating)`);
        skipped += 1;
        continue;
      }
      if (!write) {
        console.log(`  ${name}: ${readinessType} ${current} -> ${wanted} (would change)`);
        changed += 1;
        continue;
      }

      let target = await em.findOne(ReadinessLevel, { readinessType, level: wanted });
      if (!target) {
        target = em.create(ReadinessLevel, {
          level: wanted,
          name: `Seeded ${readinessType} level ${wanted}`,
          readinessType,
        });
        em.persist(target);
        await em.flush();
      }
      row.readinessLevel = target;
      row.updatedAt = new Date();
      console.log(`  ${name}: ${readinessType} ${current} -> ${wanted}`);
      changed += 1;
    }
  }

  if (write) await em.flush();
  console.log(`readiness levels: ${changed} ${write ? 'corrected' : 'would change'}, ${skipped} left alone`);
  return { changed, skipped };
}

async function run() {
  const { User } = req('entities/user.entity');
  const { Startup } = req('entities/startup.entity');
  const { CapsuleProposal } = req('entities/capsule-proposal.entity');
  const { ReadinessLevel } = req('entities/readiness-level.entity');
  const { StartupReadinessLevel } = req('entities/startup-readiness-level.entity');
  const { StartupRNA } = req('entities/rna.entity');
  const { Assessment } = req('entities/assessment.entity');
  const { StartupAssessment } = req('entities/startup-assessment.entity');
  const { QualificationStatus } = req('entities/enums/qualification-status.enum');
  const { ReadinessType } = req('entities/enums/readiness-type.enum');
  const { Role } = req('entities/enums/role.enum');

  const cfg = Object.assign({}, ormConfig, {
    entities: [User, Startup, CapsuleProposal, ReadinessLevel, StartupReadinessLevel, StartupRNA, Assessment, StartupAssessment],
  });
  const orm = await MikroORM.init(cfg);
  const em = orm.em.fork();

  // Short-circuits before step 1, so --check-levels cannot write anything at
  // all — not even the 6x9 grid the normal run would top up.
  if (CHECK_LEVELS_ONLY) {
    console.log('--check-levels: reporting only, nothing will be written\n');
    await correctReadinessLevels(em, { Startup, StartupReadinessLevel, ReadinessLevel }, false);
    await orm.close(true);
    return;
  }

  // 1. Full 6x9 grid - generateTasks skips any task whose target level has no
  //    ReadinessLevel row, so a partial grid silently drops output.
  const types = [
    ReadinessType.T, ReadinessType.M, ReadinessType.A,
    ReadinessType.O, ReadinessType.R, ReadinessType.I,
  ];
  let createdLevels = 0;
  for (const readinessType of types) {
    for (let level = 1; level <= 9; level++) {
      const existing = await em.findOne(ReadinessLevel, { readinessType, level });
      if (!existing) {
        em.persist(em.create(ReadinessLevel, {
          level,
          name: `${readinessType} Readiness Level ${level}`,
          readinessType,
        }));
        createdLevels++;
      }
    }
  }
  await em.flush();
  console.log(`readiness levels: +${createdLevels} (grid now 6 types x 9 levels)`);

  // 2. Role separation. No-op under the current main.ts; repairs older DBs.
  const argon = require('argon2');
  const password = await argon.hash('password123');
  const mentorUser = await em.findOne(User, { email: 'mentor@launchup.local' });

  for (const [startupName, f] of Object.entries(FOUNDERS)) {
    let founder = await em.findOne(User, { email: f.email });
    if (!founder) {
      founder = em.create(User, {
        email: f.email,
        hash: password,
        firstName: f.firstName,
        lastName: f.lastName,
        role: Role.Startup,
      });
      em.persist(founder);
      await em.flush();
      console.log(`  founder created: ${f.email}`);
    }

    const startup = await em.findOne(Startup, { name: startupName }, { populate: ['members', 'mentors'] });
    if (!startup) continue;

    // Owner must be the founder, not the Manager/Mentor the old main.ts assigned.
    if (startup.user.id !== founder.id) {
      startup.user = founder;
      console.log(`  ${startupName}: owner -> ${f.email}`);
    }

    // Members: the founder, not staff accounts.
    for (const m of startup.members.getItems()) {
      if (m.id !== founder.id) startup.members.remove(m);
    }
    if (!startup.members.contains(founder)) startup.members.add(founder);

    // What `appoint-mentors` would do. Setting QUALIFIED without it is the
    // shortcut that leaves a startup mentorless.
    if (mentorUser && !startup.mentors.contains(mentorUser)) {
      startup.mentors.add(mentorUser);
      console.log(`  ${startupName}: mentor -> mentor@launchup.local`);
    }
  }
  await em.flush();

  // 3. Capsule proposals + QUALIFIED status.
  for (const [name, proposal] of Object.entries(PROPOSALS)) {
    const startup = await em.findOne(Startup, { name }, { populate: ['capsuleProposal'] });
    if (!startup) {
      console.log(`  ${name}: NOT FOUND — boot the backend first so main.ts seeds it`);
      continue;
    }

    if (!startup.capsuleProposal) {
      em.persist(em.create(CapsuleProposal, { ...proposal, startup }));
      console.log(`  ${name}: capsule proposal created`);
    } else {
      console.log(`  ${name}: capsule proposal already present`);
    }

    // The coaching chain (RNA -> RNS -> initiatives) is gated on qualification.
    if (startup.qualificationStatus !== QualificationStatus.QUALIFIED) {
      startup.qualificationStatus = QualificationStatus.QUALIFIED;
      console.log(`  ${name}: qualification -> QUALIFIED`);
    }
  }
  await em.flush();

  // 3b. Correct readiness levels seeded before they were derived from the
  //     capsule proposals.
  await correctReadinessLevels(em, { Startup, StartupReadinessLevel, ReadinessLevel }, true);

  // 4. MediSync only — AgroLink stays empty so RNA generation is testable
  //    (it only generates for readiness types with no RNA yet).
  const medi = await em.findOne(Startup, { name: 'MediSync Cebu' });
  if (medi) {
    const srls = await em.find(StartupReadinessLevel, { startup: medi }, { populate: ['readinessLevel'] });
    let createdRnas = 0;
    for (const srl of srls) {
      const type = srl.readinessLevel.readinessType;
      const text = MEDISYNC_RNAS[type];
      if (!text) continue;
      const existing = await em.findOne(StartupRNA, {
        startup: medi,
        readinessLevel: srl.readinessLevel,
      });
      if (!existing) {
        em.persist(em.create(StartupRNA, {
          rna: text,
          isAiGenerated: false,
          startup: medi,
          readinessLevel: srl.readinessLevel,
        }));
        createdRnas++;
      }
    }
    await em.flush();
    console.log(`  MediSync Cebu: +${createdRnas} RNAs`);
  }

  // 5. Applied to both startups, or the assessment page is blank.
  let createdAssessments = 0;
  const allStartups = await em.find(Startup, {});
  for (const spec of ASSESSMENTS) {
    let assessment = await em.findOne(Assessment, { name: spec.name });
    if (!assessment) {
      assessment = em.create(Assessment, {
        assessmentType: spec.type,
        name: spec.name,
        description: spec.description,
        answerType: spec.answerType,
      });
      em.persist(assessment);
      await em.flush();
      createdAssessments++;
    }

    for (const startup of allStartups) {
      const existing = await em.findOne(StartupAssessment, {
        startup,
        assessment,
      });
      if (!existing) {
        em.persist(
          em.create(StartupAssessment, { startup, assessment, isApplicable: true }),
        );
      }
    }
  }
  await em.flush();
  console.log(
    `  assessments: +${createdAssessments} (${ASSESSMENTS.filter((a) => a.answerType === 3).length} File-type), applied to ${allStartups.length} startups`,
  );

  const summary = await em.find(Startup, {}, { populate: ['capsuleProposal', 'user', 'mentors'] });
  console.log('\n=== startups ===');
  for (const s of summary) {
    const rnaCount = await em.count(StartupRNA, { startup: s });
    const mentors = s.mentors.getItems().map((m) => m.email).join(', ') || 'NONE';
    console.log(`  id=${s.id} ${s.name}`);
    console.log(`     owner:    ${s.user.email} (${s.user.role})`);
    console.log(`     mentor:   ${mentors}`);
    console.log(`     proposal: ${s.capsuleProposal ? 'yes' : 'no'} | status: ${s.qualificationStatus} | RNAs: ${rnaCount}`);
  }
  console.log('\n=== accounts (all password123) ===');
  for (const u of await em.find(User, {}, { orderBy: { id: 'ASC' } })) {
    console.log(`  ${u.role.padEnd(8)} ${u.email}`);
  }

  await orm.close(true);
}

run().catch((e) => { console.error('SEED FAILED:', e); process.exit(1); });
