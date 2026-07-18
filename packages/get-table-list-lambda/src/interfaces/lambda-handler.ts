/**
 * GetTableList Lambda Handler
 *
 * ✅ VORGEFERTIGT - Das ist deine REFERENZ-IMPLEMENTIERUNG
 *
 * Studiere diese Datei! Sie zeigt das Pattern für alle Lambdas:
 * 1. Container bauen (Dependency Injection)
 * 2. Use Case aus Container holen
 * 3. Use Case ausführen
 * 4. Result<T, E> Pattern behandeln
 * 5. Response zurückgeben
 *
 * Diese Lambda ist bereits deployed - teste sie in Phase 1!
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │              LAMBDA HANDLER PATTERN                     │
 * │                                                         │
 * │   [Event] ──▶ [Handler] ──▶ [Container bauen]          │
 * │                    │                                    │
 * │                    ▼                                    │
 * │              [Use Case holen]                           │
 * │                    │                                    │
 * │                    ▼                                    │
 * │              [Use Case ausführen]                       │
 * │                    │                                    │
 * │           ┌───────┴───────┐                            │
 * │           ▼               ▼                            │
 * │      isSuccess?      !isSuccess?                       │
 * │           │               │                            │
 * │           ▼               ▼                            │
 * │     [200 + data]    [500 + error]                      │
 * └─────────────────────────────────────────────────────────┘
 */

import type { Context } from 'aws-lambda';
import { buildContainer } from '../infrastructure/container.js';
import { isSuccess } from 'contracts';

// Container wird zwischen Aufrufen gecached (Cold Start Optimierung)
let container: Awaited<ReturnType<typeof buildContainer>> | null = null;

/**
 * Lambda Handler
 *
 * Das ist der Einstiegspunkt den AWS aufruft wenn die Lambda getriggert wird.
 */
export const handler = async (
  _event: unknown, // Diese Lambda ignoriert das Event - unknown statt any!
  context: Context
): Promise<{ statusCode: number; body: string }> => {
  // Correlation ID für Tracing generieren
  const correlationId = context.awsRequestId;

  console.log(JSON.stringify({
    event: 'LAMBDA_INVOKED',
    lambdaName: 'GetTableListLambda',
    correlationId,
    timestamp: new Date().toISOString(),
  }));

  try {
    // Schritt 1: Container bauen (nur bei Cold Start)
    if (!container) {
      console.log(JSON.stringify({
        event: 'COLD_START',
        lambdaName: 'GetTableListLambda',
        correlationId,
      }));
      container = await buildContainer();
    }

    // Schritt 2: Use Case aus Container holen
    const useCase = container.getTableListUseCase;
    // Schritt 3: Use Case ausführen (correlationId reist in JEDEN Log-Eintrag mit)
    const result = await useCase.execute(correlationId);

    // Schritt 4: Result<T, E> Pattern behandeln
    if (!isSuccess(result)) {
      console.error(JSON.stringify({
        event: 'USE_CASE_FAILED',
        error: result.error.message,
        correlationId,
      }));

      return {
        statusCode: 500,
        body: JSON.stringify({ error: result.error.message }),
      };
    }

    // Schritt 5: Response zurückgeben
    console.log(JSON.stringify({
      event: 'LAMBDA_SUCCEEDED',
      tablesReturned: result.data.length,
      correlationId,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        tables: result.data,
        count: result.data.length,
      }),
    };

  } catch (error) {
    console.error(JSON.stringify({
      event: 'LAMBDA_ERROR',
      error: error instanceof Error ? error.message : String(error),
      correlationId,
      releaseId: process.env.RELEASE_ID,
    }));

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
      }),
    };
  }
};

/*
 * ✅ LERNZIEL-CHECK
 *
 * Nachdem du diese Datei studiert hast, solltest du verstehen:
 * 1. Lambda Handler Pattern (Event → Verarbeitung → Response)
 * 2. Dependency Injection (buildContainer)
 * 3. Container Caching (Cold Start Optimierung)
 * 4. Result<T, E> Pattern (isSuccess, result.data, result.error)
 * 5. Structured Logging (JSON.stringify für CloudWatch)
 *
 * 💡 TIPP: Nutze dieses Pattern für alle anderen Lambdas!
 *    Die Struktur ist immer die gleiche.
 */
