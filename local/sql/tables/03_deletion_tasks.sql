-- LTS.DeletionTasks
-- Tracks deletion phase tasks (Phase 4)

CREATE TABLE IF NOT EXISTS lts.deletion_tasks (
    id SERIAL PRIMARY KEY,
    job_id UUID NOT NULL,
    table_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    rows_processed INTEGER DEFAULT 0,
    rows_deleted INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,

    CONSTRAINT deletion_tasks_status_check
        CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_deletion_tasks_job_id ON lts.deletion_tasks(job_id);
CREATE INDEX IF NOT EXISTS idx_deletion_tasks_status ON lts.deletion_tasks(status);

\echo 'Table: deletion_tasks created'
