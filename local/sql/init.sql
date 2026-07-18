-- Initialize database and schema
-- This runs first when PostgreSQL container starts

CREATE SCHEMA IF NOT EXISTS lts;

-- Grant permissions
GRANT ALL ON SCHEMA lts TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA lts TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA lts TO postgres;

-- Set search path
ALTER DATABASE longtermstorage SET search_path TO lts, public;

\echo 'Database initialized successfully'
