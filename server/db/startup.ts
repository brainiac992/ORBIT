import 'dotenv/config';
import { db } from './index.js';
import { sql } from 'drizzle-orm';

/**
 * Runs additive schema migrations on every deploy.
 * Uses ALTER TABLE … ADD COLUMN IF NOT EXISTS so every statement is idempotent.
 * Failures are fatal — the server will not start with a broken schema.
 */
async function applyMigrations() {
  const migrations: string[] = [
    // resources — Jira assignee sync (added 2026-04-14)
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS email VARCHAR(255)`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS jira_account_id VARCHAR(255)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS resources_jira_account_id_key ON resources (jira_account_id) WHERE jira_account_id IS NOT NULL`,
  ];

  for (const stmt of migrations) {
    await db.execute(sql.raw(stmt));
  }
}

console.log('[startup] Applying schema migrations…');
applyMigrations()
  .then(() => {
    console.log('[startup] Schema up to date.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[startup] Migration failed — aborting deploy:', err);
    process.exit(1);
  });
