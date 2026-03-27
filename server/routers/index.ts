import { router } from '../trpc.js';
import { venturesRouter } from './ventures.js';
import { workstreamsRouter } from './workstreams.js';
import { milestonesRouter } from './milestones.js';
import { resourcesRouter } from './resources.js';
import { progressRouter } from './progress.js';
import { budgetRouter } from './budget.js';
import { risksRouter } from './risks.js';
import { dashboardRouter } from './dashboard.js';
import { dependenciesRouter } from './dependencies.js';
import { auditRouter } from './audit.js';
import { approvalsRouter } from './approvals.js';
import { exportRouter } from './export.js';
import { ganttRouter } from './gantt.js';
import { configRouter } from './config.js';
import { raciRouter } from './raci.js';

export const appRouter = router({
  ventures: venturesRouter,
  workstreams: workstreamsRouter,
  milestones: milestonesRouter,
  resources: resourcesRouter,
  progress: progressRouter,
  budget: budgetRouter,
  risks: risksRouter,
  dashboard: dashboardRouter,
  dependencies: dependenciesRouter,
  audit: auditRouter,
  approvals: approvalsRouter,
  export: exportRouter,
  gantt: ganttRouter,
  config: configRouter,
  raci: raciRouter,
});

export type AppRouter = typeof appRouter;
