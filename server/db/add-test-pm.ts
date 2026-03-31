import { db } from './index.js';
import { users, ventures } from './schema.js';
import { eq, and, ne, gt } from 'drizzle-orm';

async function startup() {
  // Add Test PM if not exists
  const [pm] = await db.insert(users).values({
    azureOid: 'seed-pm-003',
    email: 'testpm@adres.ae',
    name: 'Test PM',
    role: 'pm',
  }).onConflictDoNothing({ target: users.azureOid }).returning();

  if (pm) {
    console.log('Test PM created:', pm.id);
  } else {
    console.log('Test PM already exists — skipped.');
  }

  // Mark existing ventures with data as setup-complete (setupStep=6)
  // so the wizard only shows for newly created ventures
  const updated = await db.update(ventures)
    .set({ setupStep: 6 })
    .where(and(
      ne(ventures.status, 'planning'),
      eq(ventures.setupStep, 0),
    ))
    .returning();

  // Also mark any ventures with completion > 0 as setup-complete
  const updated2 = await db.update(ventures)
    .set({ setupStep: 6 })
    .where(and(
      gt(ventures.completionPct, 0),
      eq(ventures.setupStep, 0),
    ))
    .returning();

  const total = updated.length + updated2.length;
  if (total > 0) {
    console.log(`Marked ${total} existing ventures as setup-complete.`);
  }

  process.exit(0);
}

startup().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
