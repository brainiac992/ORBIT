# PM Post-BA/PO Alignment Summary — Risk Module Overhaul + RACI Matrix

**Date:** 2026-03-27
**Author:** PM Agent
**Program Brief:** /docs/risk-module-overhaul/pm/pm-brief-risk-module-overhaul.md
**Requirements Doc:** /docs/risk-module-overhaul/ba/requirements-risk-module-overhaul.md
**Backlog:** /docs/risk-module-overhaul/po/backlog-risk-module-overhaul.md
**Verdict:** MINOR DRIFT — with one scope flag requiring resolution

---

## 1. Requirements Coverage

The backlog covers all functional requirements from the BA document. Every FR- requirement has a corresponding user story or is absorbed into one:

| Requirement Group | Backlog Coverage | Notes |
|---|---|---|
| Risk Scoring (FR-RS-1 to FR-RS-5) | US-001, US-003 | Fully covered |
| Risk Weighting (FR-RW-1 to FR-RW-3) | US-002 | Fully covered |
| Risk Owner & Escalation (FR-RO-1 to FR-RO-5) | US-004, US-005 | Fully covered |
| RAG Rating (FR-RAG-1 to FR-RAG-3) | US-006 | Fully covered |
| 5x5 Heatmap (FR-HM-1 to FR-HM-5) | US-007 | Fully covered. FR-HM-6 (portfolio) correctly deferred as stretch per brief. |
| Risk List Enhancements (FR-RL-1 to FR-RL-3) | US-008, US-013 | US-013 covers card field display (FR-RL-3). Clear split. |
| RACI Schema (FR-RACI-1 to FR-RACI-6) | US-009 | Fully covered |
| RACI Standalone Page (FR-RACI-7 to FR-RACI-12) | US-011 | Fully covered |
| RACI Plan Page Compact (FR-RACI-13 to FR-RACI-16) | US-012 | Fully covered |
| Data Migration (FR-MIG-1 to FR-MIG-7) | US-010 | Fully covered |
| Dashboard Integration (FR-DASH-1 to FR-DASH-3) | US-014 | Deferred to P1 — see section 3 |
| User Manual (FR-MAN-1 to FR-MAN-4) | US-021, US-022 | Deferred to P3 — **SCOPE FLAG, see section 4** |
| Navigation (FR-NAV-1 to FR-NAV-3) | US-011 (RACI tab), US-022 (guide link) | RACI tab in MVP. Guide link deferred with manual. |
| NFR-1 to NFR-8 | Not broken into stories | Correct — NFRs are cross-cutting and should be enforced as acceptance standards, not standalone stories. |

---

## 2. Scope Creep Check

No scope creep detected. Every backlog item traces to either the PM Brief or the BA requirements document. Specifically:

- US-015 (RACI audit trail) traces to NFR-5 and the BA governance section.
- US-016 (resource removal warning) traces to the BA edge case table (resource removed from venture while holding RACI assignments).
- US-017 (CSS variables) traces to NFR-3.
- US-018 (RACI completeness indicator) is new but minor and appropriately placed at P2. It derives from the BA's metrics/KPIs section ("RACI completeness percentage"). No concern.
- US-019 (clear all filters) is a minor UX convenience. Appropriately P2. No concern.

**Verdict: No scope creep. All items are traceable.**

---

## 3. Priority Assessment

The PO's prioritization is sound with one concern:

**P0 (Must Ship):** Correct. The core scoring engine, RACI schema/UI, migration, and heatmap are the governance capability gap identified in the brief. These are the right items at P0.

**P1 (Should Ship):** Acceptable.
- US-013 (risk card display) is important for usability but the fields will already be in the form and list via P0 stories. Reasonable as P1.
- US-014 (dashboard integration) — the brief lists dashboard updates as in-scope item 12. Deferring to P1 is acceptable because dashboards are consumers of the core data, not the core itself. However, dashboards are how the GM sees value day-to-day. Recommend shipping with MVP if time permits.
- US-015 and US-016 are correctly P1. Audit and stale-resource warnings are important but not launch-blocking.

**P2 (Nice to Have):** No issues. CSS variables (US-017) should arguably be P0 since the heatmap and score badges depend on them, but the PO likely intends them to be created as part of US-003/US-007 implementation and this story captures the formal definition. Architect should confirm.

**P3 (Deferred):** See section 4 for the user manual flag. Portfolio heatmap, historical tracking, and risk categories are correctly deferred.

---

## 4. Flags and Issues

### FLAG 1 — User Manual Deferred to P3 (SCOPE ISSUE)

**Severity: High**

The PM Brief explicitly includes the user manual as in-scope item 13 and success metric SM-5. The user stated the manual is required, not optional, and should run after each feature is complete. The BA captured this correctly as FR-MAN-1 through FR-MAN-4 with clear acceptance criteria.

The PO has deferred the user manual (US-021, US-022) to P3 ("Deferred to v2") with the rationale that it "must be authored after all UI changes are finalized (Phase 7 dependency) and represents a significant standalone effort."

**The dependency reasoning is valid** — the manual should be written after all UI changes are stable to avoid rework. However, **deferring it to P3/v2 is not aligned with the approved brief.** The brief positions it as in-scope for this initiative (Phase 7), not as a future initiative.

**Required resolution:** The user manual (US-021, US-022) must be moved from P3 to P1 at minimum, with a clear note that execution is sequenced after all P0 work is complete (Phase 7). It is part of this initiative's definition of done, not a v2 item. The PO should update the backlog to reflect this.

### FLAG 2 — RAG Threshold Discrepancy (Minor, Resolved)

The PM Brief suggested a 5-band scoring system (green/yellow/amber/red/dark-red) for the heatmap. The BA requirements define RAG auto-derivation as 3-band (green/amber/red) in FR-RAG-1, while the heatmap uses 5 color bands in FR-HM-2. The PO's Open Decision OD-5 correctly notes these are separate concerns (RAG status vs. heatmap visualization). No action needed — this is properly handled.

### FLAG 3 — Migration Mapping Values (Minor, Needs Confirmation)

The PM Brief open question 3 suggested low=1, medium=3, high=5 as one option. The BA chose low=2, medium=3, high=5 (FR-MIG-1, FR-MIG-2). The backlog (US-010) follows the BA's values. This is a reasonable BA decision — low=2 avoids minimum-score clustering — but the user should confirm this mapping before migration development begins. This is a blocker-class decision per the brief.

### FLAG 4 — Dashboard Integration Timing

Dashboard integration (US-014) is P1 in the backlog but is in-scope item 12 in the brief. This is acceptable deferral for phasing purposes, but the PM recommends it ships in this release, not deferred to a follow-up. The GM's primary interface is the dashboard — without updated risk summaries there, the GM does not see the value of the scoring overhaul until navigating into individual ventures.

---

## 5. Gap Analysis

| Area | Status |
|---|---|
| All brief user stories traceable to backlog | Yes |
| All BA requirements traceable to backlog | Yes |
| Success metrics traceable to acceptance criteria | Yes — SM-1 through SM-8 all have corresponding ACs |
| Out-of-scope items respected | Yes — no backlog item crosses the exclusion boundary |
| Open questions addressed | 10 of 12 brief open questions addressed. OQ-8 (manual format) deferred with the manual. OQ-10 (historical tracking) explicitly deferred. Acceptable. |
| Risk register items mitigated in backlog | Yes — migration risk addressed by US-010 ACs (rollback script, backup). RACI friction addressed by US-009 AC (only Responsible mandatory). |
| Dependencies identified | Yes — the PO's architect notes correctly flag migration risk, schema atomicity, and RACI independence. |

---

## 6. MVP Scope Assessment

The MVP boundary is appropriate. It delivers the core governance capability (quantitative risk scoring + structured accountability) without overloading the first release with presentation-layer enhancements. The one exception is the user manual — see Flag 1.

**MVP includes:** Risk scoring schema + UI + heatmap + list enhancements + RACI schema + RACI standalone page + RACI compact view + data migration. This is the right set.

**MVP excludes (correctly):** Portfolio heatmap (stretch), historical tracking (not requested), risk categories (not requested).

**MVP excludes (needs correction):** User manual must be re-included as a final phase of this initiative, not deferred to v2.

---

## 7. Recommendation

**PROCEED TO ARCHITECT** with the following mandatory corrections to the backlog:

1. **Move US-021 (User Manual) and US-022 (User Guide sidebar link) from P3 to P1**, with a sequencing note that they execute after all P0 and other P1 work is complete. They are in-scope for this initiative per the approved brief and user directive.
2. **Confirm migration mapping values** (low=2, medium=3, high=5) with the user before development begins. This is a blocker-class decision.
3. **Recommend US-014 (Dashboard Integration) ships in this release** rather than being treated as a fast-follow. The GM's primary value surface is the dashboard.

No other changes required. The BA requirements are thorough, the PO's backlog structure is clean, and the prioritization logic is sound apart from the manual deferral.
