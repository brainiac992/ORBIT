import { useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { StatusBadge, formatAED } from '../components/StatusBadge.js';
import { VentureTabs } from './PMDashboard.js';

export function BudgetPage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const { data, isLoading } = trpc.budget.summary.useQuery({ ventureId: ventureId! });

  if (isLoading) return <div className="p-8 text-center text-[var(--text-secondary)]">Loading budget...</div>;
  if (!data) return null;

  const categoryBars = [
    { label: 'People', value: data.byCategory.people, color: 'bg-blue-500' },
    { label: 'Technology', value: data.byCategory.technology, color: 'bg-purple-500' },
    { label: 'Vendors', value: data.byCategory.vendors, color: 'bg-amber-500' },
    { label: 'Other', value: data.byCategory.other, color: 'bg-gray-400' },
  ];
  const maxCat = Math.max(...categoryBars.map(c => c.value), 1);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <VentureTabs ventureId={ventureId!} active="budget" />

      {/* Summary tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-[var(--border)] p-5">
          <div className="text-xs text-[var(--text-secondary)] mb-1">Approved Budget</div>
          <div className="text-xl font-semibold ltr-num">{formatAED(data.approvedBudget)}</div>
        </div>
        <div className="bg-white rounded-xl border border-[var(--border)] p-5">
          <div className="text-xs text-[var(--text-secondary)] mb-1">Forecast at Completion</div>
          <div className="text-xl font-semibold ltr-num">{formatAED(data.forecastAtCompletion)}</div>
        </div>
        <div className="bg-white rounded-xl border border-[var(--border)] p-5">
          <div className="text-xs text-[var(--text-secondary)] mb-1">Variance</div>
          <div className={`text-xl font-semibold ltr-num ${data.budgetVariance < 0 ? 'text-red-600' : 'text-green-600'}`}>
            {data.budgetVariance >= 0 ? '+' : ''}{formatAED(data.budgetVariance)}
          </div>
          <StatusBadge status={data.budgetStatus} />
        </div>
      </div>

      {/* Category breakdown */}
      <div className="bg-white rounded-xl border border-[var(--border)] p-5 mb-6">
        <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-4">Spend by Category</h3>
        <div className="space-y-3">
          {categoryBars.map(cat => (
            <div key={cat.label} className="flex items-center gap-3 text-sm">
              <span className="w-24 text-[var(--text-secondary)]">{cat.label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-3">
                <div
                  className={`h-3 rounded-full ${cat.color}`}
                  style={{ width: `${(cat.value / maxCat) * 100}%` }}
                />
              </div>
              <span className="w-28 text-end ltr-num">{formatAED(cat.value)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Spend log */}
      <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="text-sm font-medium">Spend Log</h3>
        </div>
        {data.entries.length === 0 ? (
          <p className="p-5 text-sm text-[var(--text-secondary)]">No spend entries logged yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--surface-muted)] text-[var(--text-secondary)] text-xs uppercase tracking-wide">
                <th className="text-start px-4 py-2">Date</th>
                <th className="text-start px-4 py-2">Category</th>
                <th className="text-start px-4 py-2">Description</th>
                <th className="text-end px-4 py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry: any) => (
                <tr key={entry.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2 ltr-num">{entry.entryDate}</td>
                  <td className="px-4 py-2 capitalize">{entry.category}</td>
                  <td className="px-4 py-2">{entry.description}</td>
                  <td className="px-4 py-2 text-end ltr-num">
                    {entry.entryType === 'correction' && <span className="text-amber-600">(correction) </span>}
                    {formatAED(Number(entry.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Forecast */}
      <div className="bg-white rounded-xl border border-[var(--border)] p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-1">Forecast to Complete</h3>
            <div className="text-lg font-semibold ltr-num">{formatAED(data.forecastToComplete)}</div>
          </div>
          {data.latestForecast && (
            <div className="text-xs text-[var(--text-secondary)]">
              Last updated: {new Date(data.latestForecast.createdAt).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
