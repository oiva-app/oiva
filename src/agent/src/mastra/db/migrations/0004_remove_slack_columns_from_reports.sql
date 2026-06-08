-- Remove the reports table's denormalized Slack identity columns.

ALTER TABLE reports
  DROP COLUMN IF EXISTS slack_message_id,
  DROP COLUMN IF EXISTS slack_channel_id;
