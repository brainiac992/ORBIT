import { useParams, Outlet } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { SetupWizard } from './SetupWizard.js';

export function VentureLayout() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const { data: state, isLoading } = trpc.wizard.state.useQuery(
    { ventureId: ventureId! },
    { enabled: !!ventureId }
  );

  if (!ventureId) return <Outlet />;
  if (isLoading) return <div className="p-8 text-[var(--text-3)]">Loading...</div>;

  // If setup is not complete, show wizard wrapper
  if (state && !state.complete) {
    return (
      <SetupWizard ventureId={ventureId}>
        <Outlet />
      </SetupWizard>
    );
  }

  return <Outlet />;
}
