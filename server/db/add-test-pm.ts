import { db } from './index.js';
import { users } from './schema.js';

async function addTestPM() {
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
  process.exit(0);
}

addTestPM().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
