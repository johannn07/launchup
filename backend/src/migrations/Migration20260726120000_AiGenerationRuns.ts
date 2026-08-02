import { Migration } from '@mikro-orm/migrations';

/**
 * Hand-written, not CLI-generated. `migration:create` diffs against the live
 * database, which here is a shared Neon instance that `main.ts` also auto-syncs
 * on every boot — the CLI would pick up unrelated drift. Written against
 * `entities/ai-generation-run.entity.ts` instead.
 *
 * The dev database is still shaped by `updateSchema()`, not by replaying this.
 * It exists so the change is reviewable and replayable somewhere that does not
 * auto-sync (a fresh database, or CI).
 *
 * Adds `ai_generation_runs` plus a nullable `generation_run_id` FK (on delete
 * set null) on rna, rns, initiatives, roadblocks, ai_recommendations and
 * ai_bias_audits.
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
