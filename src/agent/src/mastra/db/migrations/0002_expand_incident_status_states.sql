-- Expands the incident status state machine:
-- - 'report_generating' → 'report_in_process' (clearer phrasing)
-- - splits 'reported' into 'report_generated' (LLM output exists in DB) and 'report_delivered' (Slack message sent)
-- - 'closed' retained as terminal/cancel state reachable from any prior state


ALTER TABLE incidents DROP CONSTRAINT incidents_status_check;

UPDATE incidents SET status = 'report_in_process' WHERE status = 'report_generating';
UPDATE incidents SET status = 'report_generated' WHERE status = 'reported';


ALTER TABLE incidents ADD CONSTRAINT incidents_status_check
  CHECK (status IN (
    'triggered',
    'investigating',
    'report_in_process',
    'report_generated',
    'report_delivered',
    'closed'
  ));


