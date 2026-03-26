import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';
import superjson from 'superjson';
import type { UserRole } from '../shared/enums.js';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const isAuthenticated = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(isAuthenticated);

export function requireRole(...roles: UserRole[]) {
  return t.middleware(({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
    }
    if (!roles.includes(ctx.user.role as UserRole)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this resource' });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}
