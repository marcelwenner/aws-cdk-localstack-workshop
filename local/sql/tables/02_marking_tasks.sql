-- LTS.MarkingTasks
-- Tracks marking phase tasks (Phase 1)

CREATE TABLE IF NOT EXISTS lts.marking_tasks (
    id SERIAL PRIMARY KEY,
    job_id UUID NOT NULL,
    table_name VARCHAR(255) NOT NULL,
    cutoff_date TIMESTAMP NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    rows_processed INTEGER DEFAULT 0,
    rows_marked INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,

    CONSTRAINT marking_tasks_status_check
        CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_marking_tasks_job_id ON lts.marking_tasks(job_id);
CREATE INDEX IF NOT EXISTS idx_marking_tasks_status ON lts.marking_tasks(status);

\echo 'Table: marking_tasks created'
