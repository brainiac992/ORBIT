import { useState } from 'react';
import { trpc } from '../lib/trpc.js';
import { Button, Input, FormField } from '../components/Modal.js';

const CATEGORY_LABELS: Record<string, string> = {
  role_title: 'Role Titles',
  department: 'Departments',
  venture_type: 'Venture Types',
  budget_category: 'Budget Categories',
  resource_type: 'Resource Types',
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS);

export function ConfigPage() {
  const { data, isLoading } = trpc.config.listAll.useQuery();
  const utils = trpc.useUtils();
  const seedMutation = trpc.config.seed.useMutation({
    onSuccess: () => {
      utils.config.listAll.invalidate();
    },
  });

  if (isLoading) return <div className="p-8 text-[var(--text-3)]">Loading configuration...</div>;

  const grouped = data ?? {};
  const emptyCategories = ALL_CATEGORIES.filter(c => !grouped[c] || grouped[c].length === 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-0)]">Configuration</h2>
          <p className="text-sm text-[var(--text-3)] mt-1">Manage dropdown options for roles, departments, and venture types.</p>
        </div>
        {emptyCategories.length > 0 && (
          <Button
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
          >
            {seedMutation.isPending ? 'Seeding...' : 'Seed Defaults'}
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {ALL_CATEGORIES.map(category => (
          <CategorySection
            key={category}
            category={category}
            label={CATEGORY_LABELS[category]}
            options={grouped[category] ?? []}
          />
        ))}
      </div>
    </div>
  );
}

type ConfigOption = {
  id: string;
  category: string;
  label: string;
  value: string;
  sortOrder: number;
  active: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
};

function CategorySection({ category, label, options }: { category: string; label: string; options: ConfigOption[] }) {
  const [expanded, setExpanded] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] overflow-hidden animate-in">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[var(--surface-1)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-[var(--text-3)] text-sm transition-transform" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>&#9654;</span>
          <span className="text-sm font-semibold text-[var(--text-0)]">{label}</span>
          <span className="text-[10px] text-[var(--text-3)] bg-[var(--surface-1)] px-2 py-0.5 rounded-full">{options.length} options</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--border)]">
          {options.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--surface-1)] text-[var(--text-3)] text-[10px] uppercase tracking-widest">
                  <th className="text-start px-5 py-2">Label</th>
                  <th className="text-start px-5 py-2">Value</th>
                  <th className="text-start px-5 py-2 w-20">Order</th>
                  <th className="text-start px-5 py-2 w-20">Active</th>
                  <th className="text-end px-5 py-2 w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {options.map(opt => (
                  editingId === opt.id ? (
                    <EditRow key={opt.id} option={opt} onDone={() => setEditingId(null)} />
                  ) : (
                    <DisplayRow key={opt.id} option={opt} onEdit={() => setEditingId(opt.id)} />
                  )
                ))}
              </tbody>
            </table>
          )}

          {options.length === 0 && !showAdd && (
            <div className="text-center py-8 text-[var(--text-3)] text-sm">
              No options configured for this category.
            </div>
          )}

          {showAdd ? (
            <AddRow category={category} onDone={() => setShowAdd(false)} />
          ) : (
            <div className="px-5 py-3 border-t border-[var(--border)]">
              <button
                onClick={() => setShowAdd(true)}
                className="text-xs text-[var(--accent-hover)] hover:text-[var(--accent)] transition-colors font-medium"
              >
                + Add Option
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DisplayRow({ option, onEdit }: { option: ConfigOption; onEdit: () => void }) {
  const utils = trpc.useUtils();
  const toggleActive = trpc.config.update.useMutation({
    onSuccess: () => utils.config.listAll.invalidate(),
  });
  const deleteMutation = trpc.config.delete.useMutation({
    onSuccess: () => utils.config.listAll.invalidate(),
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <tr className="border-t border-[var(--border)] hover:bg-[var(--surface-1)]/50 transition-colors">
      <td className="px-5 py-2.5 text-[var(--text-0)] font-medium">{option.label}</td>
      <td className="px-5 py-2.5 text-[var(--text-2)]">{option.value}</td>
      <td className="px-5 py-2.5 text-[var(--text-2)] ltr-num">{option.sortOrder}</td>
      <td className="px-5 py-2.5">
        <button
          onClick={() => toggleActive.mutate({ id: option.id, active: !option.active })}
          disabled={toggleActive.isPending}
          className={`w-9 h-5 rounded-full relative transition-colors ${option.active ? 'bg-emerald-500' : 'bg-[var(--surface-2)]'}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${option.active ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      </td>
      <td className="px-5 py-2.5 text-end">
        {confirmDelete ? (
          <div className="flex items-center justify-end gap-1">
            <Button variant="danger" onClick={() => { deleteMutation.mutate({ id: option.id }); setConfirmDelete(false); }} className="!px-2 !py-1 !text-xs">
              Confirm
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} className="!px-2 !py-1 !text-xs">
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-1">
            <button onClick={onEdit} className="text-[var(--text-3)] hover:text-[var(--text-0)] text-xs transition-colors px-1.5 py-1">Edit</button>
            <button onClick={() => setConfirmDelete(true)} className="text-[var(--text-3)] hover:text-red-400 text-xs transition-colors px-1.5 py-1">Delete</button>
          </div>
        )}
      </td>
    </tr>
  );
}

function EditRow({ option, onDone }: { option: ConfigOption; onDone: () => void }) {
  const utils = trpc.useUtils();
  const updateMutation = trpc.config.update.useMutation({
    onSuccess: () => { utils.config.listAll.invalidate(); onDone(); },
  });
  const [form, setForm] = useState({
    label: option.label,
    value: option.value,
    sortOrder: String(option.sortOrder),
  });

  return (
    <tr className="border-t border-[var(--border)] bg-[var(--surface-1)]/30">
      <td className="px-5 py-2">
        <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} className="!py-1.5 !text-xs" />
      </td>
      <td className="px-5 py-2">
        <Input value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} className="!py-1.5 !text-xs" />
      </td>
      <td className="px-5 py-2">
        <Input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} className="!py-1.5 !text-xs !w-16" />
      </td>
      <td className="px-5 py-2" />
      <td className="px-5 py-2 text-end">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="primary"
            onClick={() => updateMutation.mutate({ id: option.id, label: form.label, value: form.value, sortOrder: parseInt(form.sortOrder) || 0 })}
            disabled={updateMutation.isPending || !form.label.trim() || !form.value.trim()}
            className="!px-2 !py-1 !text-xs"
          >
            Save
          </Button>
          <Button variant="ghost" onClick={onDone} className="!px-2 !py-1 !text-xs">Cancel</Button>
        </div>
      </td>
    </tr>
  );
}

function AddRow({ category, onDone }: { category: string; onDone: () => void }) {
  const utils = trpc.useUtils();
  const createMutation = trpc.config.create.useMutation({
    onSuccess: () => { utils.config.listAll.invalidate(); setForm({ label: '', value: '', sortOrder: '0' }); onDone(); },
  });
  const [form, setForm] = useState({ label: '', value: '', sortOrder: '0' });

  return (
    <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--surface-1)]/20">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <FormField label="Label" required>
            <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value, value: f.value || e.target.value }))} placeholder="Display label" className="!py-1.5 !text-xs" />
          </FormField>
        </div>
        <div className="flex-1">
          <FormField label="Value">
            <Input value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="Stored value" className="!py-1.5 !text-xs" />
          </FormField>
        </div>
        <div className="w-20">
          <FormField label="Order">
            <Input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} className="!py-1.5 !text-xs" />
          </FormField>
        </div>
        <div className="flex gap-1 pb-4">
          <Button
            onClick={() => createMutation.mutate({ category, label: form.label, value: form.value || form.label, sortOrder: parseInt(form.sortOrder) || 0 })}
            disabled={createMutation.isPending || !form.label.trim()}
            className="!px-3 !py-1.5 !text-xs"
          >
            Add
          </Button>
          <Button variant="ghost" onClick={onDone} className="!px-2 !py-1.5 !text-xs">Cancel</Button>
        </div>
      </div>
    </div>
  );
}
