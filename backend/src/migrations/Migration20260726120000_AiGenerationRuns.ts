import { Migration } from '@mikro-orm/migrations';

/**
 * Hand-written, not CLI-generated.
 *
 * `pnpm mikro-orm migration:create` diffs against the live database, and in
 * this repo that database is a shared Neon instance (see backend/.env) that
 * `main.ts` also auto-syncs and re-seeds on every boot via
 * `orm.getSchemaGenerator().updateSchema()`. Running the CLI here would pick
 * up unrelated schema drift from that shared instance rather than just this
 * change, so this migration was written by hand against
 * `backend/src/entities/ai-generation-run.entity.ts` instead.
 *
 * In practice, the dev/shared database is still shaped by `updateSchema()`
 * on boot, not by replaying this file. This migration exists so the change
 * is reviewable and so it can be replayed in an environment that does not
 * auto-sync (e.g. a fresh database, or CI).
 *
 * Adds:
 *  - `ai_generation_runs`, one row per AI generation call, recording the
 *    resolved AiPipelineConfig for that run.
 *  - a nullable `generation_run_id` FK (on delete set null) on each table
 *    whose rows can be attributed back to the run that produced them:
 *    rna, rns, initiatives, roadblocks, ai_recommendations, ai_bias_audits.
 */
export class Migration20260726120000_AiGenerationRuns extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "ai_generation_runs" ("id" serial primary key, "startup_id" int null, "operation" varchar(40) not null, "model" varchar(100) not null, "config" jsonb not null, "status" varchar(20) not null default 'running', "latency_ms" int null, "prompt_tokens" int null, "completion_tokens" int null, "error" text null, "created_at" timestamptz not null, "completed_at" timestamptz null);`);

    this.addSql(`alter table "ai_generation_runs" add constraint "ai_generation_runs_startup_id_foreign" foreign key ("startup_id") references "startups" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "rna" add column "generation_run_id" int null;`);
    this.addSql(`alter table "rns" add column "generation_run_id" int null;`);
    this.addSql(`alter table "initiatives" add column "generation_run_id" int null;`);
    this.addSql(`alter table "roadblocks" add column "generation_run_id" int null;`);
    this.addSql(`alter table "ai_recommendations" add column "generation_run_id" int null;`);
    this.addSql(`alter table "ai_bias_audits" add column "generation_run_id" int null;`);

    this.addSql(`alter table "rna" add constraint "rna_generation_run_id_foreign" foreign key ("generation_run_id") references "ai_generation_runs" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "rns" add constraint "rns_generation_run_id_foreign" foreign key ("generation_run_id") references "ai_generation_runs" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "initiatives" add constraint "initiatives_generation_run_id_foreign" foreign key ("generation_run_id") references "ai_generation_runs" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "roadblocks" add constraint "roadblocks_generation_run_id_foreign" foreign key ("generation_run_id") references "ai_generation_runs" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "ai_recommendations" add constraint "ai_recommendations_generation_run_id_foreign" foreign key ("generation_run_id") references "ai_generation_runs" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "ai_bias_audits" add constraint "ai_bias_audits_generation_run_id_foreign" foreign key ("generation_run_id") references "ai_generation_runs" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "rna" drop constraint "rna_generation_run_id_foreign";`);
    this.addSql(`alter table "rns" drop constraint "rns_generation_run_id_foreign";`);
    this.addSql(`alter table "initiatives" drop constraint "initiatives_generation_run_id_foreign";`);
    this.addSql(`alter table "roadblocks" drop constraint "roadblocks_generation_run_id_foreign";`);
    this.addSql(`alter table "ai_recommendations" drop constraint "ai_recommendations_generation_run_id_foreign";`);
    this.addSql(`alter table "ai_bias_audits" drop constraint "ai_bias_audits_generation_run_id_foreign";`);

    this.addSql(`alter table "rna" drop column "generation_run_id";`);
    this.addSql(`alter table "rns" drop column "generation_run_id";`);
    this.addSql(`alter table "initiatives" drop column "generation_run_id";`);
    this.addSql(`alter table "roadblocks" drop column "generation_run_id";`);
    this.addSql(`alter table "ai_recommendations" drop column "generation_run_id";`);
    this.addSql(`alter table "ai_bias_audits" drop column "generation_run_id";`);

    this.addSql(`drop table if exists "ai_generation_runs" cascade;`);
  }

}
