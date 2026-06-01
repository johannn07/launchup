import { Migration } from '@mikro-orm/migrations';

export class Migration20260528202849 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "tier_configs" ("id" serial primary key, "tier_label" varchar(255) not null, "threshold" int not null, "weights" jsonb null, "created_at" timestamptz null, "updated_at" timestamptz null);`);

    this.addSql(`create table "readiness_evaluations" ("id" serial primary key, "startup_id" int not null, "composite_score" int not null, "tier_label" varchar(255) not null, "is_provisional" boolean not null default false, "warning" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null);`);

    this.addSql(`create table "readiness_gaps" ("id" serial primary key, "evaluation_id" int not null, "dimension_key" varchar(255) not null, "score" int not null, "tier_threshold" int not null, "shortfall" int not null, "created_at" timestamptz not null);`);

    this.addSql(`create table "rag_contexts" ("id" serial primary key, "startup_id" int null, "source_type" varchar(100) not null, "title" varchar(255) not null, "content" text not null, "metadata" jsonb null, "confidence" real null, "created_at" timestamptz not null);`);

    this.addSql(`create table "ocr_documents" ("id" serial primary key, "startup_id" int null, "original_filename" varchar(255) null, "extracted_text" text null, "field_confidence" jsonb null, "processing_status" varchar(40) not null default 'processed', "legibility_status" varchar(40) not null default 'verified', "source_path" text null, "sketch_detected" boolean null, "sketch_confidence" int null, "vision_labels" jsonb null, "image_width" int null, "image_height" int null, "created_at" timestamptz not null);`);

    this.addSql(`create table "ai_recommendations" ("id" serial primary key, "startup_id" int null, "dimension_key" varchar(50) not null, "recommendation_kind" varchar(40) not null, "content" text not null, "validation_status" varchar(40) not null default 'validated', "confidence_status" varchar(40) not null default 'high-confidence', "notes" text null, "created_at" timestamptz not null);`);

    this.addSql(`create table "ai_bias_audits" ("id" serial primary key, "startup_id" int null, "dimension_key" varchar(50) not null, "raw_score" int not null, "corrected_score" int not null, "deviation" int not null, "threshold" int not null, "bias_flagged" boolean not null default false, "bias_status" varchar(40) not null default 'normalized', "justification" text null, "created_at" timestamptz not null);`);

    this.addSql(`create table "mentor_assignments" ("id" serial primary key, "startup_id" int not null, "mentor_id" int not null, "assigned_by_id" int null, "assigned_at" timestamptz not null, "is_active" boolean not null default true);`);

    this.addSql(`create table "consultation_requests" ("id" serial primary key, "startup_id" int not null, "mentor_id" int not null, "status" varchar(20) not null default 'pending', "requested_at" timestamptz not null, "resolved_at" timestamptz null);`);

    this.addSql(`alter table "readiness_evaluations" add constraint "readiness_evaluations_startup_id_foreign" foreign key ("startup_id") references "startups" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "readiness_gaps" add constraint "readiness_gaps_evaluation_id_foreign" foreign key ("evaluation_id") references "readiness_evaluations" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "rag_contexts" add constraint "rag_contexts_startup_id_foreign" foreign key ("startup_id") references "startups" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "ocr_documents" add constraint "ocr_documents_startup_id_foreign" foreign key ("startup_id") references "startups" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "ai_recommendations" add constraint "ai_recommendations_startup_id_foreign" foreign key ("startup_id") references "startups" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "ai_bias_audits" add constraint "ai_bias_audits_startup_id_foreign" foreign key ("startup_id") references "startups" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "mentor_assignments" add constraint "mentor_assignments_startup_id_foreign" foreign key ("startup_id") references "startups" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "mentor_assignments" add constraint "mentor_assignments_mentor_id_foreign" foreign key ("mentor_id") references "users" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "mentor_assignments" add constraint "mentor_assignments_assigned_by_id_foreign" foreign key ("assigned_by_id") references "users" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "consultation_requests" add constraint "consultation_requests_startup_id_foreign" foreign key ("startup_id") references "startups" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "consultation_requests" add constraint "consultation_requests_mentor_id_foreign" foreign key ("mentor_id") references "users" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "readiness_gaps" drop constraint "readiness_gaps_evaluation_id_foreign";`);

    this.addSql(`drop table if exists "tier_configs" cascade;`);

    this.addSql(`drop table if exists "readiness_evaluations" cascade;`);

    this.addSql(`drop table if exists "readiness_gaps" cascade;`);

    this.addSql(`drop table if exists "rag_contexts" cascade;`);

    this.addSql(`drop table if exists "ocr_documents" cascade;`);

    this.addSql(`drop table if exists "ai_recommendations" cascade;`);

    this.addSql(`drop table if exists "ai_bias_audits" cascade;`);

    this.addSql(`drop table if exists "mentor_assignments" cascade;`);

    this.addSql(`drop table if exists "consultation_requests" cascade;`);
  }

}
