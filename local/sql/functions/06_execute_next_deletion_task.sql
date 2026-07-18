-- Execute next batch of deletion
-- Used by LtsExecutorLambda (Phase 3)

CREATE OR REPLACE FUNCTION lts.execute_next_deletion_task(
    p_task_id INTEGER,
    p_batch_size INTEGER DEFAULT 1000
)
RETURNS TABLE (
    rows_processed INTEGER,
    has_more_work BOOLEAN
) AS $$
DECLARE
    v_current_processed INTEGER;
    v_total_rows INTEGER;
    v_batch_processed INTEGER;
BEGIN
    -- Get current progress
    SELECT dt.rows_processed
    INTO v_current_processed
    FROM lts.deletion_tasks dt
    WHERE dt.id = p_task_id;

    -- Update status to IN_PROGRESS
    UPDATE lts.deletion_tasks
    SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP
    WHERE id = p_task_id AND status = 'PENDING';

    -- Simulate processing a batch
    v_batch_processed := p_batch_size;
    v_total_rows := 5000; -- Simulated total

    -- Update progress
    UPDATE lts.deletion_tasks
    SET
        rows_processed = v_current_processed + v_batch_processed,
        rows_deleted = v_current_processed + v_batch_processed,
        updated_at = CURRENT_TIMESTAMP,
        status = CASE
            WHEN (v_current_processed + v_batch_processed) >= v_total_rows THEN 'COMPLETED'
            ELSE 'IN_PROGRESS'
        END,
        completed_at = CASE
            WHEN (v_current_processed + v_batch_processed) >= v_total_rows THEN CURRENT_TIMESTAMP
            ELSE NULL
        END
    WHERE id = p_task_id;

    -- Return result
    RETURN QUERY
    SELECT
        v_batch_processed::INTEGER,
        ((v_current_processed + v_batch_processed) < v_total_rows)::BOOLEAN;
END;
$$ LANGUAGE plpgsql;

\echo 'Function: execute_next_deletion_task created'
