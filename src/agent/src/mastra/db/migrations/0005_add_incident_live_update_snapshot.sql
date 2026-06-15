-- Adds live_update_snapshot: a JSON snapshot of the live incident message's
-- render inputs (status, alert, activity/update log, attach count, report),
-- written at terminal render (report_delivered / failed).
--
-- Purpose: when an incident is closed from a COLD path — the cleanup reaper, or
-- any close after a process restart — the in-memory render state is gone, so the
-- root Slack message can't be rebuilt to drop its Close button. This snapshot is
-- the persisted fallback the reporter rebuilds from, preserving the update log.
--
-- Nullable, no default: existing rows read back NULL, the sentinel for "predates
-- snapshot persistence → skip the cold rebuild and fall back to the prior
-- behavior (post the closed thread reply only)." Metadata-only add: no table
-- rewrite, no backfill, safe against the live deployment.

ALTER TABLE incidents ADD COLUMN live_update_snapshot JSONB;
