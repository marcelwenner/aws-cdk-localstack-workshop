-- Start marking phase for a table
-- Used by MarkingStarterLambda (Phase 2)

CREATE OR REPLACE FUNCTION lts.start_table_marking(
    p_job_id UUID,
    p_table_name VARCHAR,
    p_cutoff_date TIMESTAMP
)
RETURNS TABLE (task_id INTEGER) AS $$
BEGIN
    -- Insert marking task
    RETURN QUERY
    INSERT INTO lts.marking_tasks (job_id, table_name, cutoff_date, status)
    VALUES (p_job_id, p_table_name, p_cutoff_date, 'PENDING')
    RETURNING id;

    -- Log to audit
    INSERT INTO lts.audit_log (job_id, event_type, event_data)
    VALUES (
        p_job_id,
        'MARKING_STARTED',
        jsonb_build_object(
            'table_name', p_table_name,
            'cutoff_date', p_cutoff_date
        )
    );
END;
$$ LANGUAGE plpgsql;

\echo 'Function: start_table_marking created'
