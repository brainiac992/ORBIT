import { useEffect, useRef } from 'react';
import { trpc } from '../lib/trpc.js';

// Re-export trpc jira namespace as a typed hook namespace
// Individual hooks are thin wrappers to keep page components clean

export function useJiraConnection() {
  return trpc.jira.getConnection.useQuery(undefined, {
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

export function useSyncDashboard() {
  return trpc.jira.getSyncDashboard.useQuery(undefined, {
    retry: 1,
    refetchInterval: 30_000, // refresh every 30s automatically
  });
}

export function useVentureSyncDetail(ventureId: string | undefined) {
  return trpc.jira.getVentureSyncDetail.useQuery(
    { ventureId: ventureId! },
    { enabled: !!ventureId, retry: 1 }
  );
}

export function useImportStatus(jobId: string | null, enabled: boolean) {
  const result = trpc.jira.getImportStatus.useQuery(
    { jobId: jobId! },
    {
      enabled: enabled && !!jobId,
      refetchInterval: enabled ? 500 : false,
    }
  );
  return result;
}

/** Returns minutes since a timestamp, or null if no timestamp */
export function minutesSince(ts: string | null | undefined): number | null {
  if (!ts) return null;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 60_000);
}

/** Derive sync health colour class from last-synced timestamp and error state */
export function syncHealthClass(lastSyncedAt: string | null | undefined, hasError: boolean): 'green' | 'amber' | 'red' {
  if (hasError) return 'red';
  const mins = minutesSince(lastSyncedAt);
  if (mins === null) return 'red';
  if (mins <= 30) return 'green';
  if (mins <= 120) return 'amber';
  return 'red';
}

export function syncHealthLabel(lastSyncedAt: string | null | undefined, hasError: boolean): string {
  if (hasError) return 'Error';
  const mins = minutesSince(lastSyncedAt);
  if (mins === null) return 'Never synced';
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
