import { useState, useEffect, useRef } from 'react';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface SystemStatus {
  dockerRunning: boolean;
  localstackRunning: boolean;
  postgresRunning: boolean;
  /** True if any service is down */
  hasError: boolean;
  /** True if status just changed from ok to error (for alerts) */
  justFailed: boolean;
  /** Which service just failed */
  failedService: 'docker' | 'localstack' | 'postgres' | null;
  /** Dismiss the alert */
  dismissAlert: () => void;
}

/**
 * Hook to check system status (Docker, LocalStack, Postgres)
 * Polls every 10 seconds to keep status up-to-date
 * Detects when services go down and triggers alerts
 */
export function useSystemStatus(): SystemStatus {
  const [status, setStatus] = useState({
    dockerRunning: true, // Assume running initially
    localstackRunning: true,
    postgresRunning: true,
  });
  const [justFailed, setJustFailed] = useState(false);
  const [failedService, setFailedService] = useState<'docker' | 'localstack' | 'postgres' | null>(null);

  // Track previous status to detect changes
  const prevStatusRef = useRef({ docker: true, localstack: true, postgres: true });
  const initialCheckDone = useRef(false);

  const dismissAlert = () => {
    setJustFailed(false);
    setFailedService(null);
  };

  useEffect(() => {
    const checkStatus = async () => {
      const [docker, localstack, postgres] = await Promise.all([
        checkDockerRunning(),
        checkLocalStackRunning(),
        checkPostgresRunning(),
      ]);

      // Detect failures (only after initial check)
      if (initialCheckDone.current) {
        const prev = prevStatusRef.current;

        if (prev.docker && !docker) {
          setJustFailed(true);
          setFailedService('docker');
        } else if (prev.localstack && !localstack) {
          setJustFailed(true);
          setFailedService('localstack');
        } else if (prev.postgres && !postgres) {
          setJustFailed(true);
          setFailedService('postgres');
        }
      }

      initialCheckDone.current = true;
      prevStatusRef.current = { docker, localstack, postgres };

      setStatus({
        dockerRunning: docker,
        localstackRunning: localstack,
        postgresRunning: postgres,
      });
    };

    // Initial check
    checkStatus();

    // Poll every 10 seconds
    const interval = setInterval(checkStatus, 10000);

    return () => clearInterval(interval);
  }, []);

  const hasError = !status.dockerRunning || !status.localstackRunning || !status.postgresRunning;

  return {
    ...status,
    hasError,
    justFailed,
    failedService,
    dismissAlert,
  };
}

/**
 * Check if Docker is running
 */
async function checkDockerRunning(): Promise<boolean> {
  try {
    await execAsync('docker info');
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if LocalStack is running (port 4566 accessible)
 */
async function checkLocalStackRunning(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:4566/_localstack/health', {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check if Postgres is running (port 5432 accessible)
 */
async function checkPostgresRunning(): Promise<boolean> {
  try {
    // Try multiple container name patterns (compose project name varies)
    const containerNames = ['local-postgres-1', 'workshop-postgres', 'postgres'];
    for (const name of containerNames) {
      try {
        await execAsync(`docker exec ${name} pg_isready -U postgres`);
        return true;
      } catch {
        continue;
      }
    }
    return false;
  } catch {
    return false;
  }
}
