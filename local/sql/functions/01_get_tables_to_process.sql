-- Get list of tables to process
-- Used by GetTableListLambda

CREATE OR REPLACE FUNCTION lts.get_tables_to_process()
RETURNS TABLE (
    table_name VARCHAR,
    schema_name VARCHAR,
    cutoff_days INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ct.table_name,
        ct.schema_name,
        ct.cutoff_days
    FROM lts.configure_tables ct
    WHERE ct.is_active = TRUE
    ORDER BY ct.table_name;
END;
$$ LANGUAGE plpgsql;

\echo 'Function: get_tables_to_process created'
