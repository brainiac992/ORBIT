import { auditTrail } from '../db/schema.js';
import type { AuditAction } from '../../shared/enums.js';

interface LogAuditParams {
  entityType: string;
  entityId: string;
  ventureId?: string | null;
  action: AuditAction;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  changedBy: string;
}

/**
 * Inserts an entry into the audit_trail table.
 * Accepts any drizzle db or transaction object.
 */
export async function logAudit(
  db: { insert: Function },
  params: LogAuditParams,
): Promise<void> {
  await (db as any).insert(auditTrail).values({
    entityType: params.entityType,
    entityId: params.entityId,
    ventureId: params.ventureId ?? null,
    action: params.action,
    fieldName: params.fieldName ?? null,
    oldValue: params.oldValue ?? null,
    newValue: params.newValue ?? null,
    changedBy: params.changedBy,
  });
}

/**
 * Helper that diffs two objects and logs an audit entry per changed field.
 */
export async function logAuditDiff(
  db: { insert: Function },
  opts: {
    entityType: string;
    entityId: string;
    ventureId?: string | null;
    changedBy: string;
    before: Record<string, any>;
    after: Record<string, any>;
  },
): Promise<void> {
  for (const key of Object.keys(opts.after)) {
    const oldVal = opts.before[key];
    const newVal = opts.after[key];
    if (newVal !== undefined && String(oldVal) !== String(newVal)) {
      await logAudit(db, {
        entityType: opts.entityType,
        entityId: opts.entityId,
        ventureId: opts.ventureId,
        action: 'updated',
        fieldName: key,
        oldValue: oldVal != null ? String(oldVal) : null,
        newValue: newVal != null ? String(newVal) : null,
        changedBy: opts.changedBy,
      });
    }
  }
}
