import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '../../server/routers/index.js';

export const trpc = createTRPCReact<AppRouter>();

export function getTrpcClient(azureOid: string) {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: '/api/trpc',
        transformer: superjson,
        headers: () => ({
          Authorization: `Bearer dev-token`,
          'x-azure-oid': azureOid,
        }),
      }),
    ],
  });
}
