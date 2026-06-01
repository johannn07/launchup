import { Migration } from '@mikro-orm/migrations';

export class Migration20260528160512_InstallVectorExtension extends Migration {

  override async up(): Promise<void> {
    this.addSql('CREATE EXTENSION IF NOT EXISTS vector;');
  }

  override async down(): Promise<void> {
    this.addSql('DROP EXTENSION IF EXISTS vector;');
  }

}