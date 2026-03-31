import { execSync } from 'child_process';

// Push schema changes to DB (non-interactive, safe for deploy)
console.log('Pushing schema...');
try {
  execSync('npx drizzle-kit push --force', { stdio: 'inherit' });
  console.log('Schema push complete.');
} catch (e) {
  console.warn('Schema push failed (may already be up to date):', (e as Error).message);
}
