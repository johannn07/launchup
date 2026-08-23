/**
 * Throwaway fixtures for manually testing `fix/silent-controls` in the browser.
 *
 *   node probe-manual-test.js setup      creates two ZZ test startups
 *   node probe-manual-test.js status     prints their state
 *   node probe-manual-test.js teardown   removes them
 *
 * Every command asserts AgroLink's and MediSync's readiness levels are exactly
 * the 2026-08-05 measurement ground truth, before and after, and refuses to do
 * anything if they have moved. Delete this file when you are done with it.
 */
const { MikroORM } = require('@mikro-orm/postgresql');
const { analyzeTone } = require('./dist/src/ai/summary-tone.js');

const GUARD = {
  1: { Technology: 2, Market: 3, Acceptance: 3, Organizational: 2, Regulatory: 1, Investment: 1 },
  2: { Technology: 6, Market: 5, Acceptance: 5, Organizational: 2, Regulatory: 1, Investment: 1 }
};

const FLAGGED_NAME = 'ZZ Manual Test (flagged, pending)';
const RATED_NAME = 'ZZ Manual Test (rated)';

// Praise with no critical observation, so analyzeTone scores ratio 0 and flags.
const LENIENT =
  'This venture demonstrates strong market viability with a compelling value proposition. ' +
  'The founding team is impressive and execution to date has been excellent. ' +
  'It is well-positioned to capture significant opportunity in a scalable market.';

// Distinct levels on purpose: uniform values cannot reveal a dimension mis-mapping.
const RATED_LEVELS = { Technology: 7, Acceptance: 2, Market: 5, Organizational: 8, Regulatory: 3, Investment: 6 };

// Recursive sorted-key canonicaliser. NOT a JSON.stringify replacer array —
// that filters keys at every level, strips the root's 1/2, and compares {} to
// {} forever, which is a guard that cannot fail.
const canon = (o) =>
  o && typeof o === 'object'
    ? '{' + Object.keys(o).sort().map((k) => `${k}:${canon(o[k])}`).join(',') + '}'
    : String(o);

async function checkGuard(c, when) {
  const rows = await c.execute(
    `select s.id, rl.readiness_type as t, rl.level as l from startups_readiness_level srl
     join startups s on s.id = srl.startup_id
     join readiness_levels rl on rl.id = srl.readiness_level_id
     where s.id in (1,2)`
  );
  const got = { 1: {}, 2: {} };
  for (const r of rows) got[r.id][r.t] = r.l;
  if (canon(got) !== canon(GUARD)) {
    throw new Error(
      `GROUND TRUTH MOVED (${when}). AgroLink/MediSync readiness levels are not the measurement reference.\n` +
        `  expected ${canon(GUARD)}\n  got      ${canon(got)}`
    );
  }
  console.log(`  guard ok (${when}) — AgroLink and MediSync unchanged`);
}

async function idOf(c, name) {
  const rows = await c.execute(`select id from startups where name = ?`, [name]);
  return rows.length ? rows[0].id : null;
}

async function setup(c) {
  const tone = analyzeTone(LENIENT);
  console.log(`  fixture summary: ratio ${tone.ratio.toFixed(3)}, flagged ${tone.flagged}`);
  if (!tone.flagged) throw new Error('fixture is not flagged — testing it would prove nothing');

  // 1. Pending + flagged summary, for the SO 4.4 approval gate.
  let flaggedId = await idOf(c, FLAGGED_NAME);
  if (!flaggedId) {
    flaggedId = (
      await c.execute(
        `insert into startups (name, user_id, qualification_status, data_privacy, eligibility, sector)
         values (?, 1, 1, true, true, 'agritech') returning id`,
        [FLAGGED_NAME]
      )
    )[0].id;
  }
  if (!(await c.execute(`select id from capsule_proposals where startup_id = ${flaggedId}`)).length) {
    await c.execute(
      `insert into capsule_proposals (title, description, problem_statement, target_market, solution_description,
        objectives, historical_timeline, competitive_advantage_analysis, members, ai_analysis_summary,
        intellectual_property_status, curriculum_vitae, scope, methodology, startup_id)
       values (?, 'Manual test fixture', 'p', 'm', 's', '[]', '[]', '[]', '[]', ?, 'none', '', '', '', ${flaggedId})`,
      [FLAGGED_NAME, LENIENT]
    );
  }

  // 2. Already rated, for the mentor revise flow.
  let ratedId = await idOf(c, RATED_NAME);
  if (!ratedId) {
    ratedId = (
      await c.execute(
        `insert into startups (name, user_id, qualification_status, data_privacy, eligibility, sector)
         values (?, 1, 3, true, true, 'agritech') returning id`,
        [RATED_NAME]
      )
    )[0].id;
  }
  if (!(await c.execute(`select id from startups_readiness_level where startup_id = ${ratedId}`)).length) {
    for (const [type, level] of Object.entries(RATED_LEVELS)) {
      const rl = await c.execute(
        `select id from readiness_levels where readiness_type = ? and level = ? limit 1`,
        [type, level]
      );
      if (!rl.length) throw new Error(`no readiness_levels row for ${type} ${level}`);
      await c.execute(
        `insert into startups_readiness_level (startup_id, readiness_level_id, created_at, updated_at)
         values (${ratedId}, ${rl[0].id}, now(), now())`
      );
    }
  }
  // A mentor must be attached or the startup will not appear in the mentor's list.
  if (!(await c.execute(`select 1 from startups_mentors where startup_id = ${ratedId} and user_id = 4`)).length) {
    await c.execute(`insert into startups_mentors (startup_id, user_id) values (${ratedId}, 4)`);
  }

  console.log(`\n  ITEM 1 — approval gate: "${FLAGGED_NAME}" (id ${flaggedId}), Applications > Pending`);
  console.log(`  ITEM 3 — revise baseline: "${RATED_NAME}" (id ${ratedId})`);
  console.log(`     http://localhost:5173/startups/${ratedId}/readiness-level`);
  console.log(`     stored levels: ${Object.entries(RATED_LEVELS).map(([k, v]) => k[0] + v).join(' ')}`);
}

async function status(c) {
  const rows = await c.execute(
    `select id, name, qualification_status from startups where name like 'ZZ Manual Test%' order by id`
  );
  console.log('  fixtures:', rows.length ? JSON.stringify(rows) : 'none — run setup');
  for (const r of rows) {
    const lv = await c.execute(
      `select rl.readiness_type as t, rl.level as l from startups_readiness_level srl
       join readiness_levels rl on rl.id = srl.readiness_level_id where srl.startup_id = ${r.id}
       order by rl.readiness_type`
    );
    if (lv.length) console.log(`    ${r.id} levels:`, lv.map((x) => `${x.t}=${x.l}`).join(' '));
  }
  const logs = await c.execute(`select actor, details from activity_logs order by id`);
  console.log('  activity_logs:', logs.length, JSON.stringify(logs));
}

async function teardown(c) {
  for (const name of [FLAGGED_NAME, RATED_NAME]) {
    const id = await idOf(c, name);
    if (!id) continue;
    if ([1, 2, 5].includes(id)) throw new Error('refusing: fixture id collides with a real startup');
    for (const sql of [
      `delete from activity_logs where details like '%startup ${id}%'`,
      `delete from startup_assessments where startup_id = ${id}`,
      `delete from startups_mentors where startup_id = ${id}`,
      `delete from readiness_gaps where evaluation_id in (select id from readiness_evaluations where startup_id = ${id})`,
      `delete from readiness_evaluations where startup_id = ${id}`,
      `delete from startups_readiness_level where startup_id = ${id}`,
      `delete from capsule_proposals where startup_id = ${id}`,
      `delete from startups where id = ${id}`
    ]) {
      await c.execute(sql);
    }
    console.log(`  removed "${name}" (id ${id})`);
  }
}

(async () => {
  const cmd = process.argv[2];
  if (!['setup', 'status', 'teardown'].includes(cmd)) {
    console.error('usage: node probe-manual-test.js setup|status|teardown');
    process.exit(1);
  }
  const orm = await MikroORM.init({
    ...require('./dist/src/mikro-orm.config').default,
    entities: ['./dist/src/entities/**/*.entity.js'],
    entitiesTs: [],
    debug: false
  });
  const c = orm.em.getConnection();
  console.log(`\n${cmd}:`);
  await checkGuard(c, 'before');
  await { setup, status, teardown }[cmd](c);
  await checkGuard(c, 'after');
  console.log('');
  await orm.close(true);
})().catch((e) => {
  console.error('\nFAILED:', e.message, '\n');
  process.exit(1);
});
