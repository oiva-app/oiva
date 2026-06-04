-- Incident lifecycle + live Slack updates support:
-- - adds 'failed' status (investigation/report generation failed; retryable,
--   excluded from correlation, drained to 'closed' by the reaper)
-- - adds the incident's Slack thread identity (slack_thread_ts, slack_channel_id),
--   the source of truth for the live incident message — created at announce time,
--   before any report row exists
-- - adds status_updated_at: time the incident entered its current status, used by
--   the cleanup reaper to find stale/parked incidents


-- 0002 re-added incidents_status_check without 'failed'; re-create it with 'failed'.
ALTER TABLE incidents DROP CONSTRAINT incidents_status_check;
ALTER TABLE incidents ADD CONSTRAINT incidents_status_check
  CHECK (status IN (
    'triggered',
    'investigating',
    'report_in_process',
    'report_generated',
    'report_delivered',
    'failed',
    'closed'
  ));


ALTER TABLE incidents ADD COLUMN slack_thread_ts   TEXT;
ALTER TABLE incidents ADD COLUMN slack_channel_id  TEXT;
ALTER TABLE incidents ADD COLUMN status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
