import { BaseValidator } from './base.validator.js';
import { workshopConfig } from '../config/workshop.config.js';

/**
 * Phase 1 Validator
 * Tests GetTableListLambda - should return list of tables from Postgres
 *
 * Success Criteria:
 * - Lambda is deployed
 * - Lambda returns array of table names
 * - Array contains at least one table (from lts.configure_tables)
 */
export default class Phase1Validator extends BaseValidator {
  async validate(): Promise<{ passed: boolean; hints?: string[] }> {
    const hints: string[] = [];

    // Test 1: Lambda is deployed and can be invoked
    const { success, result, error } = await this.invokeLambda<{ tables: string[] }>(
      workshopConfig.lambdas.GetTableList
    );

    if (!success) {
      hints.push('Lambda kann nicht aufgerufen werden');
      hints.push(`Fehler: ${error}`);
      hints.push('Prüfe: pnpm run workshop deploy');
      return { passed: false, hints };
    }

    // Test 2: Response has correct structure
    if (!result || !Array.isArray(result.tables)) {
      hints.push('Lambda gibt keine Table-Liste zurück');
      hints.push('Erwartete Struktur: { tables: string[] }');
      return { passed: false, hints };
    }

    // Test 3: At least one table is returned
    // The Lambda reads from lts.configure_tables where is_active = TRUE
    if (result.tables.length === 0) {
      hints.push('Lambda gibt leere Tabellen-Liste zurück');
      hints.push('Prüfe: lts.configure_tables hat aktive Einträge');
      return { passed: false, hints };
    }

    return { passed: true };
  }
}
