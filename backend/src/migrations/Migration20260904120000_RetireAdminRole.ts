import { Migration } from '@mikro-orm/migrations';

/**
 * Drop the Admin role. SRS 2.3 defines three user classes and SDD 1.4 puts
 * every administrative function behind Manager, so Admin was drift.
 *
 * The update must precede the constraint or the check fails on existing rows.
 * `main.ts` runs the same conversion on boot because `updateSchema()`, not this
 * migration, is what actually shapes the dev databases.
 */
export class Migration20260904120000_RetireAdminRole extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `update "users" set "role" = 'Manager' where "role" = 'Admin';`,
    );

    this.addSql(
      `alter table "users" drop constraint if exists "users_role_check";`,
    );

    this.addSql(
      `alter table "users" add constraint "users_role_check" check("role" in ('Startup', 'Mentor', 'Manager'));`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "users" drop constraint if exists "users_role_check";`,
    );

    this.addSql(
      `alter table "users" add constraint "users_role_check" check("role" in ('Startup', 'Mentor', 'Manager', 'Admin'));`,
    );
  }
}
