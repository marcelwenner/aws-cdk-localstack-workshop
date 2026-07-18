-- LTS.ConfigureTables
-- Defines which tables should be processed for archival

CREATE TABLE IF NOT EXISTS lts.configure_tables (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(255) NOT NULL UNIQUE,
    schema_name VARCHAR(255) NOT NULL DEFAULT 'dbo',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    cutoff_days INTEGER NOT NULL DEFAULT 365,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Sample data
INSERT INTO lts.configure_tables (table_name, schema_name, cutoff_days) VALUES
    ('CustomerLoadFact', 'dbo', 365),
    ('OrderHistory', 'dbo', 730)
ON CONFLICT (table_name) DO NOTHING;

\echo 'Table: configure_tables created'
