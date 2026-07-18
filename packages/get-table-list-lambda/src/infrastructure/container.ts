/**
 * Dependency Injection Container
 *
 * This is the "Composition Root" - where we wire up all dependencies.
 *
 * Why? Because we don't want to hardcode dependencies in our use cases.
 * This makes testing easier and keeps our code clean.
 */

import { PostgresAdapter } from 'database-adapter-postgres';
import { GetTableListUseCase } from '../application/use-cases/get-table-list.use-case.js';

/**
 * Build the container with all dependencies
 *
 * Called once at Lambda cold start
 */
export async function buildContainer() {
  // Get config from environment variables
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'longtermstorage',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  };

  // Create database adapter
  const database = new PostgresAdapter(dbConfig);

  // Create use case with dependencies
  const getTableListUseCase = new GetTableListUseCase(database);

  // Return container object
  return {
    database,
    getTableListUseCase,
  };
}

export type Container = Awaited<ReturnType<typeof buildContainer>>;
