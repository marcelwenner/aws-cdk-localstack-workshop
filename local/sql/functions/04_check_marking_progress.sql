-- Check marking progress
-- Used by StatusPollerLambda (Phase 4)

CREATE OR REPLACE FUNCTION lts.check_marking_progress(
    p_job_id UUID
)
RETURNS TABLE (
    status VARCHAR,
    rows_processed INTEGER,
    rows_marked INTEGER,
    progress_percent NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        mt.status,
        mt.rows_processed,
        mt.rows_marked,
        CASE
            WHEN mt.rows_processed = 0 THEN 0::NUMERIC
            ELSE ROUND((mt.rows_marked::NUMERIC / NULLIF(mt.rows_processed, 0) * 100), 2)
        END as progress_percent
    FROM lts.marking_tasks mt
    WHERE mt.job_id = p_job_id
    ORDER BY mt.id DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

\echo 'Function: check_marking_progress created'
