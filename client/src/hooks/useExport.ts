import { trpc } from '../lib/trpc.js';

export function useExportVenture(ventureId: string) {
  const utils = trpc.useUtils();

  const exportCSV = async () => {
    const data = await utils.export.ventureReport.fetch({ ventureId });
    if (!data) return;

    const rows = [
      ['ADRES PMO — Venture Report'],
      ['Generated', new Date().toISOString()],
      [],
      ['Venture', data.venture.name],
      ['Status', data.venture.status],
      ['Health', data.venture.health],
      ['Completion', `${data.venture.completionPct}%`],
      ['Start Date', data.venture.startDate],
      ['Target End', data.venture.targetEndDate],
      [],
      ['Budget Summary'],
      ['Approved', data.budget.approvedBudget],
      ['Actual Spend', data.budget.actualSpend],
      ['Forecast at Completion', data.budget.forecastAtCompletion],
      ['Variance', data.budget.budgetVariance],
      ['Status', data.budget.budgetStatus],
      [],
      ['Workstreams'],
      ['Name', 'Status', 'Completion %', 'Baseline Start', 'Baseline End'],
      ...data.workstreams.map((ws: any) => [ws.name, ws.status, `${ws.completionPct}%`, ws.baselineStart ?? '', ws.baselineEnd ?? '']),
      [],
      ['Open Risks'],
      ['Title', 'Probability', 'Impact', 'RAG', 'Owner'],
      ...data.risks.map((r: any) => [r.title, r.probability, r.impact, r.rag, r.owner ?? '']),
    ];

    const csv = rows.map(row => (row as any[]).map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadBlob(csv, `${data.venture.name.replace(/\s+/g, '-')}-report.csv`, 'text/csv');
  };

  const printReport = () => {
    window.print();
  };

  return { exportCSV, printReport };
}

export function useExportPortfolio() {
  const utils = trpc.useUtils();

  const exportCSV = async () => {
    const data = await utils.export.portfolioReport.fetch();
    if (!data) return;

    const rows = [
      ['ADRES PMO — Portfolio Report'],
      ['Generated', new Date().toISOString()],
      [],
      ['Summary'],
      ['Total Active', data.summary.totalActive],
      ['On Track', data.summary.onTrack],
      ['At Risk', data.summary.atRisk],
      ['Off Track', data.summary.offTrack],
      [],
      ['Ventures'],
      ['Name', 'PM', 'Health', 'Completion %', 'Budget Status', 'Escalations', 'Last Updated'],
      ...data.ventures.map((v: any) => [v.name, v.pmName, v.health, `${v.completionPct}%`, v.budgetStatus, v.escalationCount, v.updatedAt]),
    ];

    const csv = rows.map(row => (row as any[]).map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadBlob(csv, `portfolio-report-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
  };

  return { exportCSV };
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob(['\ufeff' + content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
