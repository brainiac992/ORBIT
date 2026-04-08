# ORBIT Environment Variables

## Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (e.g. `postgresql://user:password@host:5432/adres_pmo`) |
| `JWT_SECRET` | Secret for signing JWT tokens |
| `NODE_ENV` | Runtime environment — set to `production` on Railway. Controls dev auth bypass and other behaviours. |
| `PORT` | Port the server listens on. Defaults to `3000` if not set. Railway sets this automatically. |

## Optional

| Variable | Description |
|---|---|
| `FRONTEND_URL` | URL of the frontend app. Used in development (e.g. `http://localhost:5173`). |
| `CORS_ORIGIN` | Allowed CORS origin in production. Defaults to `https://orbit.adres.ae` if not set. |

## Jira Integration (required if using Jira sync)

| Variable | Required | Description |
|---|---|---|
| `JIRA_ENCRYPTION_KEY` | Yes, if using Jira | AES-256-GCM key for encrypting stored Jira credentials. Must be 32+ high-entropy characters. Generate with: `openssl rand -hex 32`. Without this, the Jira settings page will not be functional. |
