import { describe, it, expect } from 'vitest';
import { syncHealthClass, syncHealthLabel, minutesSince } from '../../client/src/hooks/useJira.js';

// ── minutesSince ──────────────────────────────────────────────────────────────

describe('minutesSince', () => {
  it('returns null for null/undefined input', () => {
    expect(minutesSince(null)).toBeNull();
    expect(minutesSince(undefined)).toBeNull();
  });

  it('returns approximately 0 for now', () => {
    const now = new Date().toISOString();
    const result = minutesSince(now);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThanOrEqual(0);
    expect(result!).toBeLessThan(2);
  });

  it('returns approximately 60 for one hour ago', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result = minutesSince(oneHourAgo);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThanOrEqual(59);
    expect(result!).toBeLessThan(62);
  });
});

// ── syncHealthClass ───────────────────────────────────────────────────────────

describe('syncHealthClass', () => {
  it('returns red when hasError is true regardless of timestamp', () => {
    const now = new Date().toISOString();
    expect(syncHealthClass(now, true)).toBe('red');
  });

  it('returns red when lastSyncedAt is null', () => {
    expect(syncHealthClass(null, false)).toBe('red');
  });

  it('returns green when synced within last hour', () => {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    expect(syncHealthClass(thirtyMinsAgo, false)).toBe('green');
  });

  it('returns amber when synced 1-6 hours ago', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(syncHealthClass(twoHoursAgo, false)).toBe('amber');
  });

  it('returns red when synced more than 6 hours ago', () => {
    const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    expect(syncHealthClass(sevenHoursAgo, false)).toBe('red');
  });

  it('returns green at exactly 59 minutes ago', () => {
    const fiftynine = new Date(Date.now() - 59 * 60 * 1000).toISOString();
    expect(syncHealthClass(fiftynine, false)).toBe('green');
  });

  it('returns amber at exactly 61 minutes ago', () => {
    const sixtyone = new Date(Date.now() - 61 * 60 * 1000).toISOString();
    expect(syncHealthClass(sixtyone, false)).toBe('amber');
  });

  it('returns amber at exactly 359 minutes ago', () => {
    const threefiftynine = new Date(Date.now() - 359 * 60 * 1000).toISOString();
    expect(syncHealthClass(threefiftynine, false)).toBe('amber');
  });
});

// ── syncHealthLabel ───────────────────────────────────────────────────────────

describe('syncHealthLabel', () => {
  it('returns "Error" when hasError is true', () => {
    const now = new Date().toISOString();
    expect(syncHealthLabel(now, true)).toBe('Error');
  });

  it('returns "Never synced" for null timestamp', () => {
    expect(syncHealthLabel(null, false)).toBe('Never synced');
  });

  it('returns "Just now" for timestamp under 1 minute ago', () => {
    const justNow = new Date(Date.now() - 30 * 1000).toISOString();
    expect(syncHealthLabel(justNow, false)).toBe('Just now');
  });

  it('returns minutes label for recent sync', () => {
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(syncHealthLabel(fiveMinsAgo, false)).toBe('5m ago');
  });

  it('returns hours label for syncs hours ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(syncHealthLabel(threeHoursAgo, false)).toBe('3h ago');
  });

  it('returns days label for syncs days ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(syncHealthLabel(twoDaysAgo, false)).toBe('2d ago');
  });
});
