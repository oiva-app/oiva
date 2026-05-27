CREATE TABLE incidents (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status        TEXT NOT NULL DEFAULT 'triggered'
                  CHECK (status IN (
                    'triggered', 'investigating',
                    'report_generating', 'reported', 'closed'
                  )),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at   TIMESTAMPTZ
  );

CREATE TABLE alerts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id        UUID REFERENCES incidents(id) ON DELETE SET NULL,
  received_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_payload        JSONB NOT NULL,

  -- Vendor identity lives at the boundary where the data arrives.
  source             TEXT NOT NULL DEFAULT 'honeycomb',

  -- Wire-level idempotency: a webhook retry with the same
  -- (source, vendor_instance_id) collides on the UNIQUE index below
  -- instead of inserting a duplicate row.
  vendor_instance_id TEXT,

  -- Key fields extracted from raw_payload for correlation lookups
  -- (matching new alerts to active incidents).
  trigger_name       TEXT,
  dataset            TEXT,
  query_id           TEXT
);

-- Idempotent receipt. Partial so seed/test rows can omit vendor_instance_id.
CREATE UNIQUE INDEX alerts_source_instance_uniq
  ON alerts(source, vendor_instance_id)
  WHERE vendor_instance_id IS NOT NULL;

-- Correlation lookup: "active incidents matching this
-- (trigger_name, dataset, query_id) within window N".
-- Composite supports partial-key filters too.
CREATE INDEX idx_alerts_correlation
  ON alerts(trigger_name, dataset, query_id, received_at DESC);

CREATE INDEX idx_alerts_incident_id ON alerts(incident_id);
CREATE INDEX idx_alerts_received_at ON alerts(received_at DESC);

CREATE TABLE reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id      UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  report_json      JSONB NOT NULL,
  slack_message_id TEXT,
  slack_channel_id TEXT,
  feedback         TEXT CHECK (feedback IN ('positive', 'negative'))
                    -- nullable; initial value is always NULL
);

CREATE INDEX idx_reports_incident_id ON reports(incident_id);