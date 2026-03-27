import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { StatusBadge, formatAED, SectionHeader } from '../components/StatusBadge.js';
import { Modal, FormField, Input, TextArea, Select, Button } from '../components/Modal.js';
import { useAuth } from '../lib/auth.js';
import { formatDate } from '../lib/format.js';

export function BudgetPage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.budget.summary.useQuery({ ventureId: ventureId! });
  const [showSpendForm, setShowSpendForm] = useState(false);
  const [showForecastForm, setShowForecastForm] = useState(false);
  const [showSetBudget, setShowSetBudget] = useState(false);

  const isGM = user?.role === 'gm';
  const isPMO = user?.role === 'pmo';

  if (isLoading) return <div className="p-8 text-center text-[var(--text-3)]">Loading budget...</div>;
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
      {/* Navigation handled by sidebar */}

      {/* Summary tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] p-5">
          <div className="text-xs text-[var(--text-3)] mb-1">Approved Budget</div>
          <div className="text-xl font-semibold ltr-num text-[var(--text-0)]">{formatAED(data.approvedBudget)}</div>
          {isPMO && !data.budgetLocked && (
            <Button variant="secondary" className="mt-2 !text-xs" onClick={() => setShowSetBudget(true)}>Set Approved Budget</Button>
          )}
          {data.budgetLocked && <span className="text-xs text-emerald-400 mt-1 inline-block">Locked</span>}
        </div>
        <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] p-5">
          <div className="text-xs text-[var(--text-3)] mb-1">Forecast at Completion</div>
          <div className="text-xl font-semibold ltr-num text-[var(--text-0)]">{formatAED(data.forecastAtCompletion)}</div>
        </div>
        <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] p-5">
          <div className="text-xs text-[var(--text-3)] mb-1">Variance</div>
          <div className={`text-xl font-semibold ltr-num ${data.budgetVariance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {data.budgetVariance >= 0 ? '+' : ''}{formatAED(data.budgetVariance)}
          </div>
          <StatusBadge status={data.budgetStatus} />
        </div>
      </div>

      {/* Category breakdown */}
      <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] p-5 mb-6">
        <h3 className="text-xs font-medium text-[var(--text-3)] uppercase tracking-widest mb-4">Spend by Category</h3>
        <div className="space-y-3">
          {categoryBars.map(cat => (
            <div key={cat.label} className="flex items-center gap-3 text-sm">
              <span className="w-24 text-[var(--text-3)]">{cat.label}</span>
              <div className="flex-1 bg-[var(--surface-2)] rounded-full h-3">
                <div className={`h-3 rounded-full ${cat.color}`} style={{ width: `${(cat.value / maxCat) * 100}%` }} />
              </div>
              <span className="w-28 text-end ltr-num">{formatAED(cat.value)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      {!isGM && (
        <div className="flex gap-3 mb-6">
          <Button onClick={() => setShowSpendForm(true)}>Log Spend Entry</Button>
          <Button variant="secondary" onClick={() => setShowForecastForm(true)}>Update Forecast</Button>
        </div>
      )}

      {/* Spend log */}
      <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-medium">Spend Log</h3>
          <p className="text-xs text-[var(--text-3)]">Entries cannot be edited. Log a correction to adjust.</p>
        </div>
        {data.entries.length === 0 ? (
          <p className="p-5 text-sm text-[var(--text-3)]">No spend entries logged yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--surface-1)] text-[var(--text-3)] text-xs uppercase tracking-widest">
                <th className="text-start px-4 py-2">Date</th>
                <th className="text-start px-4 py-2">Type</th>
                <th className="text-start px-4 py-2">Category</th>
                <th className="text-start px-4 py-2">Description</th>
                <th className="text-end px-4 py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry: any) => (
                <tr key={entry.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2 ltr-num">{formatDate(entry.entryDate)}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={entry.entryType === 'correction' ? 'at_risk' : entry.entryType === 'committed' ? 'upcoming' : 'on_track'} />
                  </td>
                  <td className="px-4 py-2 capitalize">{entry.category}</td>
                  <td className="px-4 py-2">{entry.description}{entry.vendor && <span className="text-[var(--text-3)]"> — {entry.vendor}</span>}</td>
                  <td className="px-4 py-2 text-end ltr-num font-medium">{formatAED(Number(entry.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Forecast */}
      <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-medium text-[var(--text-3)] uppercase tracking-widest mb-1">Forecast to Complete</h3>
            <div className="text-lg font-semibold ltr-num">{formatAED(data.forecastToComplete)}</div>
          </div>
          {data.latestForecast && (
            <div className="text-xs text-[var(--text-3)]">
              Last updated: {formatDate(data.latestForecast.createdAt)}
            </div>
          )}
        </div>
      </div>

      {/* ── Forms ──────────────────────── */}
      <SpendEntryForm open={showSpendForm} onClose={() => setShowSpendForm(false)} ventureId={ventureId!} />
      <ForecastForm open={showForecastForm} onClose={() => setShowForecastForm(false)} ventureId={ventureId!} currentForecast={data.forecastToComplete} />
      <SetBudgetForm open={showSetBudget} onClose={() => setShowSetBudget(false)} ventureId={ventureId!} />
    </div>
  );
}

function SpendEntryForm({ open, onClose, ventureId }: { open: boolean; onClose: () => void; ventureId: string }) {
  const utils = trpc.useUtils();
  const log = trpc.budget.logEntry.useMutation({ onSuccess: () => { utils.budget.summary.invalidate({ ventureId }); onClose(); } });
  const [form, setForm] = useState({ amount: '', entryDate: new Date().toISOString().split('T')[0], category: 'people', description: '', vendor: '', entryType: 'actual' });

  const handleSubmit = () => {
    if (!form.amount || !form.description.trim()) return;
    log.mutate({ ventureId, ...form, entryType: form.entryType as any, category: form.category as any, vendor: form.vendor || undefined });
    setForm({ amount: '', entryDate: new Date().toISOString().split('T')[0], category: 'people', description: '', vendor: '', entryType: 'actual' });
  };

  return (
    <Modal open={open} onClose={onClose} title="Log Spend Entry">
      <FormField label="Type">
        <Select value={form.entryType} onChange={e => setForm(f => ({ ...f, entryType: e.target.value }))}>
          <option value="actual">Actual Spend</option>
          <option value="committed">Committed (PO raised)</option>
          <option value="correction">Correction</option>
        </Select>
      </FormField>
      <FormField label="Amount (AED)" required><Input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="e.g. 45000" /></FormField>
      <FormField label="Date" required><Input type="date" value={form.entryDate} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} /></FormField>
      <FormField label="Category" required>
        <Select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
          <option value="people">People</option>
          <option value="technology">Technology</option>
          <option value="vendors">Vendors</option>
          <option value="other">Other</option>
        </Select>
      </FormField>
      <FormField label="Description" required><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. March contractor fee" /></FormField>
      <FormField label="Vendor"><Input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} placeholder="e.g. Acme Consulting" /></FormField>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={log.isPending || !form.amount || !form.description.trim()}>{log.isPending ? 'Saving...' : 'Log Entry'}</Button>
      </div>
    </Modal>
  );
}

function ForecastForm({ open, onClose, ventureId, currentForecast }: { open: boolean; onClose: () => void; ventureId: string; currentForecast: number }) {
  const utils = trpc.useUtils();
  const update = trpc.budget.updateForecast.useMutation({ onSuccess: () => { utils.budget.summary.invalidate({ ventureId }); onClose(); } });
  const [amount, setAmount] = useState(String(currentForecast));

  const handleSubmit = () => {
    if (!amount) return;
    update.mutate({ ventureId, forecastToComplete: amount });
  };

  return (
    <Modal open={open} onClose={onClose} title="Update Forecast to Complete">
      <FormField label="Forecast to Complete (AED)" required>
        <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Estimated remaining spend" />
      </FormField>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={update.isPending || !amount}>{update.isPending ? 'Saving...' : 'Update Forecast'}</Button>
      </div>
    </Modal>
  );
}

function SetBudgetForm({ open, onClose, ventureId }: { open: boolean; onClose: () => void; ventureId: string }) {
  const utils = trpc.useUtils();
  const set = trpc.budget.setBudget.useMutation({ onSuccess: () => { utils.budget.summary.invalidate({ ventureId }); onClose(); } });
  const [amount, setAmount] = useState('');

  return (
    <Modal open={open} onClose={onClose} title="Set Approved Budget">
      <p className="text-xs text-amber-400 mb-4">Once set, the approved budget cannot be changed.</p>
      <FormField label="Approved Budget (AED)" required>
        <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 2100000" />
      </FormField>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => { if (amount) set.mutate({ ventureId, amount }); }} disabled={set.isPending || !amount}>{set.isPending ? 'Saving...' : 'Approve & Lock Budget'}</Button>
      </div>
    </Modal>
  );
}
