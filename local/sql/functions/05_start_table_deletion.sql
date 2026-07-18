-- Start deletion phase for a table
-- Used by DeletionStarterLambda (Phase 5)

CREATE OR REPLACE FUNCTION lts.start_table_deletion(
    p_job_id UUID,
    p_table_name VARCHAR
)
RETURNS TABLE (task_id INTEGER) AS $$
BEGIN
    -- Insert deletion task
    RETURN QUERY
    INSERT INTO lts.deletion_tasks (job_id, table_name, status)
    VALUES (p_job_id, p_table_name, 'PENDING')
    RETURNING id;

    -- Log to audit
    INSERT INTO lts.audit_log (job_id, event_type, event_data)
    VALUES (
        p_job_id,
        'DELETION_STARTED',
        jsonb_build_object('table_name', p_table_name)
    );
END;
$$ LANGUAGE plpgsql;

\echo 'Function: start_table_deletion created'
