import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './routers/index.js';
import { createContext } from './context.js';
import { registerJiraWebhookRoute } from './webhooks/jiraWebhook.js';
import { startReconciliationJob } from './services/jiraReconciliation.js';
import { startDailyImportJob } from './services/jiraImport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ── Jira integration key check ────────────────────────────
// The app starts without this key but the Jira integration will be
// unconfigurable until it is set. Minimum 32 characters required for
// AES-256-GCM encryption of stored API tokens.
const jiraEncryptionKey = process.env.JIRA_ENCRYPTION_KEY;
if (!jiraEncryptionKey) {
  console.warn(
    '[WARN] JIRA_ENCRYPTION_KEY is not set. ' +
    'The Jira integration will be unavailable until this environment variable is configured.'
  );
} else if (jiraEncryptionKey.length < 32) {
  console.warn(
    '[WARN] JIRA_ENCRYPTION_KEY is set but is shorter than 32 characters. ' +
    'A minimum of 32 characters is required for AES-256-GCM encryption. ' +
    'The Jira integration will be unavailable until a valid key is provided.'
  );
}

app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CORS_ORIGIN || 'https://orbit.adres.ae'
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));

// ── Jira webhook route — MUST be registered before express.json() ──
// Uses express.raw({ type: 'application/json', limit: '2mb' }) so that
// the raw Buffer is preserved for HMAC-SHA256 validation. Jira payloads
// are never legitimately larger than 2 MB; the limit guards against
// memory exhaustion from maliciously oversized bodies.
registerJiraWebhookRoute(app);

app.use(express.json({ limit: '50kb' }));

// Rate limiting — 200 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// tRPC API
app.use('/api/trpc', createExpressMiddleware({
  router: appRouter,
  createContext,
}));

// Serve built frontend in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('{*path}', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`ADRES PMO server running on port ${PORT}`);
  // Start Jira reconciliation job after server is bound and DB is reachable
  startReconciliationJob();
  // Start daily 7 AM UAE (3 AM UTC) delta import scheduler
  startDailyImportJob();
});

export { appRouter };
