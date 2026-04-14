import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { SectionHeader, StatusBadge } from '../components/StatusBadge.js';
import { Modal, FormField, Input, TextArea, Select, Button } from '../components/Modal.js';
import { SearchInput } from '../components/SearchInput.js';
import { useAuth } from '../lib/auth.js';
import { formatDate } from '../lib/format.js';
import { ARTIFACT_STAGE, ARTIFACT_STAGE_LABELS } from '../../../shared/enums.js';
import type { ArtifactStage } from '../../../shared/enums.js';

const STAGE_COLORS: Record<string, string> = {
  initiation: 'bg-blue-500/15 text-blue-400',
  planning: 'bg-indigo-500/15 text-indigo-400',
  execution: 'bg-emerald-500/15 text-emerald-400',
  monitoring: 'bg-amber-500/15 text-amber-400',
  closure: 'bg-gray-500/15 text-gray-400',
};

const FILE_ICONS: Record<string, string> = {
  'application/pdf': '📄',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '📽',
  'image/png': '🖼',
  'image/jpeg': '🖼',
  'text/plain': '📃',
};

function getFileIcon(mimeType?: string | null) {
  if (!mimeType) return '📎';
  return FILE_ICONS[mimeType] ?? '📎';
}

function formatFileSize(bytes?: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ArtifactsPage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const { user } = useAuth();
  const { data, isLoading } = trpc.artifacts.list.useQuery({ ventureId: ventureId! });
  const [showUpload, setShowUpload] = useState(false);
  const [filterStage, setFilterStage] = useState<string>('all');
  const [search, setSearch] = useState('');
  const canManage = user?.role === 'pmo' || user?.role === 'pm';

  if (isLoading) return <div className="p-8 text-[var(--text-3)]">Loading artifacts...</div>;

  const filtered = useMemo(() => {
    let list = filterStage === 'all' ? data ?? [] : (data ?? []).filter((a: any) => a.stage === filterStage);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a: any) =>
        (a.name ?? '').toLowerCase().includes(q) ||
        (a.description ?? '').toLowerCase().includes(q) ||
        (a.fileName ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [data, filterStage, search]);

  // Group by stage
  const grouped = ARTIFACT_STAGE.reduce((acc, stage) => {
    const items = filtered.filter((a: any) => a.stage === stage);
    if (items.length > 0) acc.push({ stage, label: ARTIFACT_STAGE_LABELS[stage], items });
    return acc;
  }, [] as { stage: string; label: string; items: any[] }[]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <SectionHeader
        title="Artifacts"
        action={canManage ? <Button onClick={() => setShowUpload(true)}>Upload Artifact</Button> : undefined}
      />

      {/* Stage filter + search */}
      <div className="flex flex-wrap gap-3 mb-6 items-center no-print">
        <SearchInput value={search} onChange={setSearch} placeholder="Search artifacts…" className="w-52" />
      </div>
      <div className="flex gap-1 mb-4 bg-[var(--surface-0)] rounded-xl p-1 border border-[var(--border)] no-print">
        <button
          onClick={() => setFilterStage('all')}
          className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            filterStage === 'all' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-2)] hover:text-[var(--text-0)]'
          }`}
        >
          All
        </button>
        {ARTIFACT_STAGE.map(stage => (
          <button
            key={stage}
            onClick={() => setFilterStage(stage)}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              filterStage === stage ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-2)] hover:text-[var(--text-0)]'
            }`}
          >
            {ARTIFACT_STAGE_LABELS[stage]}
          </button>
        ))}
      </div>

      {(!data || data.length === 0) ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">📁</div>
          <h3 className="text-lg font-semibold text-[var(--text-0)] mb-2">No Artifacts Yet</h3>
          <p className="text-sm text-[var(--text-3)] mb-6">Upload project documents like charters, plans, reports, and deliverables.</p>
          {canManage && <Button onClick={() => setShowUpload(true)}>Upload First Artifact</Button>}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-[var(--text-3)]">No artifacts in this stage.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.stage}>
              <div className="flex items-center gap-2 mb-3">
                <h4 className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-widest">{group.label}</h4>
                <span className="text-[10px] bg-[var(--surface-1)] text-[var(--text-3)] px-2 py-0.5 rounded-full">{group.items.length}</span>
              </div>
              <div className="grid gap-3">
                {group.items.map((artifact: any, i: number) => (
                  <ArtifactCard key={artifact.id} artifact={artifact} ventureId={ventureId!} canManage={canManage} delay={i * 30} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <UploadArtifactForm open={showUpload} onClose={() => setShowUpload(false)} ventureId={ventureId!} />
    </div>
  );
}

function ArtifactCard({ artifact, ventureId, canManage, delay }: { artifact: any; ventureId: string; canManage: boolean; delay: number }) {
  const utils = trpc.useUtils();
  const deleteArtifact = trpc.artifacts.delete.useMutation({
    onSuccess: () => utils.artifacts.list.invalidate({ ventureId }),
  });
  const [confirm, setConfirm] = useState(false);

  return (
    <div
      className="bg-[var(--surface-0)] rounded-xl border border-[var(--border)] p-4 flex items-start gap-4 hover:border-[var(--border-hover)] transition-all animate-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="text-2xl flex-shrink-0 mt-0.5">{getFileIcon(artifact.mimeType)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-[var(--text-0)] truncate">{artifact.name}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STAGE_COLORS[artifact.stage] ?? STAGE_COLORS.closure}`}>
            {ARTIFACT_STAGE_LABELS[artifact.stage as ArtifactStage]}
          </span>
        </div>
        {artifact.description && (
          <p className="text-xs text-[var(--text-2)] mb-1.5 line-clamp-2">{artifact.description}</p>
        )}
        <div className="flex items-center gap-3 text-[10px] text-[var(--text-3)]">
          <span>{artifact.fileName}</span>
          {artifact.fileSize && <span>{formatFileSize(artifact.fileSize)}</span>}
          <span>by {artifact.uploadedByName}</span>
          <span>{formatDate(artifact.createdAt)}</span>
        </div>
      </div>
      {canManage && (
        <div className="flex-shrink-0">
          {confirm ? (
            <div className="flex gap-1">
              <Button variant="ghost" onClick={() => setConfirm(false)} className="!text-xs !px-2">Cancel</Button>
              <Button
                variant="ghost"
                onClick={() => deleteArtifact.mutate({ id: artifact.id })}
                className="!text-xs !px-2 !text-red-400"
              >
                {deleteArtifact.isPending ? '...' : 'Delete'}
              </Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirm(true)} className="!text-xs !px-2 !text-[var(--text-3)]">
              Remove
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function UploadArtifactForm({ open, onClose, ventureId }: { open: boolean; onClose: () => void; ventureId: string }) {
  const utils = trpc.useUtils();
  const create = trpc.artifacts.create.useMutation({
    onSuccess: () => {
      utils.artifacts.list.invalidate({ ventureId });
      setForm({ name: '', description: '', stage: 'planning', fileName: '', fileSize: 0, mimeType: '' });
      setFile(null);
      onClose();
    },
  });
  const [form, setForm] = useState({ name: '', description: '', stage: 'planning', fileName: '', fileSize: 0, mimeType: '' });
  const [file, setFile] = useState<File | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setForm(prev => ({
      ...prev,
      fileName: f.name,
      fileSize: f.size,
      mimeType: f.type,
      name: prev.name || f.name.replace(/\.[^.]+$/, ''),
    }));
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.fileName) return;
    // TODO: When S3 is integrated, upload file first via getUploadUrl, then create record with s3Key
    create.mutate({
      ventureId,
      name: form.name,
      description: form.description || undefined,
      stage: form.stage as any,
      fileName: form.fileName,
      fileSize: form.fileSize || undefined,
      mimeType: form.mimeType || undefined,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Upload Artifact">
      <FormField label="File" required>
        <label className="flex items-center justify-center gap-3 px-4 py-6 border-2 border-dashed border-[var(--border)] rounded-xl cursor-pointer hover:border-[var(--accent)] hover:bg-[var(--surface-1)] transition-all">
          <input type="file" className="hidden" onChange={handleFileSelect} />
          {file ? (
            <div className="text-center">
              <div className="text-2xl mb-1">{getFileIcon(file.type)}</div>
              <div className="text-sm font-medium text-[var(--text-0)]">{file.name}</div>
              <div className="text-[10px] text-[var(--text-3)]">{formatFileSize(file.size)}</div>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-2xl mb-1">📎</div>
              <div className="text-sm text-[var(--text-2)]">Click to select a file</div>
              <div className="text-[10px] text-[var(--text-3)] mt-1">PDF, Word, Excel, PowerPoint, images</div>
            </div>
          )}
        </label>
      </FormField>
      <FormField label="Artifact Name" required>
        <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Project Charter v1.0" />
      </FormField>
      <FormField label="Description">
        <TextArea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Brief description of this document" />
      </FormField>
      <FormField label="Project Stage" required>
        <Select value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}>
          {ARTIFACT_STAGE.map(stage => (
            <option key={stage} value={stage}>{ARTIFACT_STAGE_LABELS[stage]}</option>
          ))}
        </Select>
      </FormField>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={create.isPending || !form.name.trim() || !form.fileName}>
          {create.isPending ? 'Uploading...' : 'Upload'}
        </Button>
      </div>
    </Modal>
  );
}
