import { db } from './index.js';
import { users, ventures, workstreams, milestones, resources, resourceAssignments } from './schema.js';

async function seed() {
  console.log('Seeding database...');

  // ── Users ──────────────────────────────────────────
  const [gmUser] = await db.insert(users).values({
    azureOid: 'seed-gm-001',
    email: 'gm@adres.ae',
    name: 'General Manager',
    role: 'gm',
  }).returning();

  const [pmoUser] = await db.insert(users).values({
    azureOid: 'seed-pmo-001',
    email: 'pmo@adres.ae',
    name: 'PMO Lead',
    role: 'pmo',
  }).returning();

  const [pm1] = await db.insert(users).values({
    azureOid: 'seed-pm-001',
    email: 'omar@adres.ae',
    name: 'Omar Shawahneh',
    role: 'pm',
  }).returning();

  const [pm2] = await db.insert(users).values({
    azureOid: 'seed-pm-002',
    email: 'hannah@adres.ae',
    name: 'Hannah Wray',
    role: 'pm',
  }).returning();

  const [pm3] = await db.insert(users).values({
    azureOid: 'seed-pm-003',
    email: 'testpm@adres.ae',
    name: 'Test PM',
    role: 'pm',
  }).returning();

  // ── Resources ──────────────────────────────────────
  const [res1] = await db.insert(resources).values({
    name: 'Ahmed Rahman',
    type: 'internal',
    roleTitle: 'Senior Developer',
    department: 'Engineering',
  }).returning();

  const [res2] = await db.insert(resources).values({
    name: 'Lina Khalil',
    type: 'internal',
    roleTitle: 'Data Engineer',
    department: 'Data',
  }).returning();

  const [res3] = await db.insert(resources).values({
    name: 'TechVentures LLC',
    type: 'external',
    roleTitle: 'Integration Partner',
    company: 'TechVentures LLC',
  }).returning();

  // ── Venture 1: DARI.AE ────────────────────────────
  const [dari] = await db.insert(ventures).values({
    name: 'DARI.AE',
    description: 'Operations & Technology platform for DARI.AE real estate services',
    ventureType: 'Technology Platform',
    pmUserId: pm1.id,
    status: 'active',
    health: 'on_track',
    startDate: '2026-01-01',
    targetEndDate: '2026-06-30',
    completionPct: 72,
    approvedBudget: '2100000.00',
    budgetLocked: true,
    createdBy: pmoUser.id,
  }).returning();

  // Workstreams for DARI.AE
  const [ws1] = await db.insert(workstreams).values({
    ventureId: dari.id,
    name: 'AI Integration',
    ownerResourceId: res1.id,
    baselineStart: '2026-01-01',
    baselineEnd: '2026-03-31',
    actualStart: '2026-01-05',
    status: 'in_progress',
    completionPct: 65,
    sortOrder: 1,
  }).returning();

  const [ws2] = await db.insert(workstreams).values({
    ventureId: dari.id,
    name: 'Customer Migration',
    ownerResourceId: res2.id,
    baselineStart: '2026-02-01',
    baselineEnd: '2026-04-30',
    actualStart: '2026-02-03',
    status: 'in_progress',
    completionPct: 40,
    sortOrder: 2,
  }).returning();

  // Milestones
  await db.insert(milestones).values([
    { workstreamId: ws1.id, name: 'Model training complete', dueDate: '2026-03-15', actualCompletionDate: '2026-03-12', status: 'achieved' },
    { workstreamId: ws1.id, name: 'API v2 Launch', dueDate: '2026-04-03', status: 'upcoming' },
    { workstreamId: ws1.id, name: 'Production deploy', dueDate: '2026-04-20', status: 'upcoming' },
    { workstreamId: ws2.id, name: 'Data mapping complete', dueDate: '2026-03-10', status: 'upcoming' },
    { workstreamId: ws2.id, name: 'Migration complete', dueDate: '2026-04-30', status: 'upcoming' },
  ]);

  // Resource assignments
  await db.insert(resourceAssignments).values([
    { resourceId: res1.id, ventureId: dari.id, hoursPerWeek: '30', startDate: '2026-01-01', createdBy: pmoUser.id },
    { resourceId: res2.id, ventureId: dari.id, hoursPerWeek: '20', startDate: '2026-02-01', createdBy: pmoUser.id },
  ]);

  // ── Venture 2: ADREC Property Platform ─────────────
  const [adrec] = await db.insert(ventures).values({
    name: 'ADREC Property Platform',
    description: 'Property management platform for Abu Dhabi Real Estate Council',
    ventureType: 'Property Platform',
    pmUserId: pm2.id,
    status: 'active',
    health: 'at_risk',
    startDate: '2026-01-15',
    targetEndDate: '2026-07-31',
    completionPct: 58,
    approvedBudget: '4300000.00',
    budgetLocked: true,
    createdBy: pmoUser.id,
  }).returning();

  const [ws3] = await db.insert(workstreams).values({
    ventureId: adrec.id,
    name: 'TAMM Consumer Migration',
    ownerResourceId: res2.id,
    baselineStart: '2026-01-15',
    baselineEnd: '2026-04-30',
    actualStart: '2026-01-20',
    status: 'in_progress',
    completionPct: 55,
    sortOrder: 1,
  }).returning();

  const [ws4] = await db.insert(workstreams).values({
    ventureId: adrec.id,
    name: 'Service Charges Integration',
    ownerResourceId: res3.id,
    baselineStart: '2026-02-01',
    baselineEnd: '2026-05-31',
    actualStart: '2026-02-10',
    status: 'in_progress',
    completionPct: 30,
    sortOrder: 2,
  }).returning();

  await db.insert(milestones).values([
    { workstreamId: ws3.id, name: 'TAMM API connection live', dueDate: '2026-03-20', status: 'upcoming' },
    { workstreamId: ws3.id, name: 'Consumer data fully migrated', dueDate: '2026-04-30', status: 'upcoming' },
    { workstreamId: ws4.id, name: 'Service charge calculator v1', dueDate: '2026-04-15', status: 'upcoming' },
  ]);

  await db.insert(resourceAssignments).values([
    { resourceId: res2.id, ventureId: adrec.id, hoursPerWeek: '15', startDate: '2026-01-15', createdBy: pmoUser.id },
    { resourceId: res3.id, ventureId: adrec.id, hoursPerWeek: '25', startDate: '2026-02-01', createdBy: pmoUser.id },
  ]);

  console.log('Seed complete.');
  console.log('  Users: GM, PMO, 3 PMs');
  console.log('  Resources: 2 internal, 1 external');
  console.log('  Ventures: DARI.AE, ADREC Property Platform');
  console.log('  Workstreams: 4 total across 2 ventures');
  console.log('  Milestones: 8 total');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
