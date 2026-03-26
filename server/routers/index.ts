import { router } from '../trpc.js';
import { venturesRouter } from './ventures.js';
import { workstreamsRouter } from './workstreams.js';
import { milestonesRouter } from './milestones.js';
import { resourcesRouter } from './resources.js';
import { progressRouter } from './progress.js';
import { budgetRouter } from './budget.js';
import { risksRouter } from './risks.js';
import { dashboardRouter } from './dashboard.js';

export const appRouter = router({
  ventures: venturesRouter,
  workstreams: workstreamsRouter,
  milestones: milestonesRouter,
  resources: resourcesRouter,
  progress: progressRouter,
  budget: budgetRouter,
  risks: risksRouter,
  dashboard: dashboardRouter,
});

export type AppRouter = typeof appRouter;
