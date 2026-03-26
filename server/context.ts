import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { db } from './db/index.js';
import { users } from './db/schema.js';
import { eq } from 'drizzle-orm';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  azureOid: string;
}

export interface Context {
  user: AuthUser | null;
  db: typeof db;
}

const isDev = process.env.NODE_ENV !== 'production' || process.env.DEV_AUTH === 'true';

export async function createContext({ req }: CreateExpressContextOptions): Promise<Context> {
  let user: AuthUser | null = null;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    let azureOid: string | undefined;

    if (isDev) {
      // DEV ONLY: trust x-azure-oid header for local development
      azureOid = req.headers['x-azure-oid'] as string | undefined;
    } else {
      // PRODUCTION: verify JWT against Azure AD JWKS
      // TODO: Implement MSAL JWT verification
      // const decoded = await verifyAzureToken(token);
      // azureOid = decoded.oid;
    }

    if (azureOid) {
      const [dbUser] = await db
        .select()
        .from(users)
        .where(eq(users.azureOid, azureOid))
        .limit(1);

      if (dbUser && dbUser.active) {
        user = {
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          role: dbUser.role,
          azureOid: dbUser.azureOid,
        };
      }
    }
  }

  return { user, db };
}
