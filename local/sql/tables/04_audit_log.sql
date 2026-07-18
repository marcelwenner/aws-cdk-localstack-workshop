-- LTS.AuditLog
-- Audit trail for all operations

CREATE TABLE IF NOT EXISTS lts.audit_log (
    id SERIAL PRIMARY KEY,
    job_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_job_id ON lts.audit_log(job_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON lts.audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON lts.audit_log(created_at);

\echo 'Table: audit_log created'
