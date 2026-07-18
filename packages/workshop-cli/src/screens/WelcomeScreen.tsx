/**
 * WelcomeScreen - Boot Sequence + HUD Menu
 *
 * Displays an animated boot sequence followed by a HUD-style menu.
 * Creates a "hacker feeling" for workshop participants.
 *
 * Now includes REAL system checks (Docker, LocalStack, Postgres) during boot!
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import Spinner from 'ink-spinner';
import { spawn } from 'child_process';
import path from 'path';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

export interface WelcomeScreenProps {
  onStart: () => void;
  onExit: () => void;
}

// Threshold for compact layout (two-column objectives)
const COMPACT_HEIGHT = 40;

const rootDir = path.resolve(process.cwd(), '..', '..');

type BootLogStatus = 'pending' | 'running' | 'done' | 'error';

interface BootLog {
  message: string;
  status: BootLogStatus;
  isRealCheck?: boolean; // True for actual system checks
}

const INITIAL_BOOT_LOGS: BootLog[] = [
  { message: "Loading Workshop CLI v1.0.0...", status: 'pending' },
  { message: "Initializing graphics engine...", status: 'pending' },
  { message: "Loading state manager...", status: 'pending' },
  // Real system checks
  { message: "Checking Docker daemon...", status: 'pending', isRealCheck: true },
  { message: "Checking LocalStack...", status: 'pending', isRealCheck: true },
  { message: "Checking Postgres...", status: 'pending', isRealCheck: true },
  { message: "Verifying system readiness...", status: 'pending', isRealCheck: true },
];

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStart, onExit }) => {
  const [bootLogs, setBootLogs] = useState<BootLog[]>(INITIAL_BOOT_LOGS);
  const [currentStep, setCurrentStep] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [selectedOption, setSelectedOption] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const terminalSize = useTerminalSize();

  const isCompact = terminalSize.rows < COMPACT_HEIGHT;

  // Update a specific log entry
  const updateLog = useCallback((index: number, status: BootLogStatus, message?: string) => {
    setBootLogs(logs => logs.map((log, i) =>
      i === index ? { ...log, status, message: message || log.message } : log
    ));
  }, []);

  // Real system checks - use spawn() to not block event loop
  // Based on: https://github.com/sindresorhus/ora/issues/86
  const runCommand = useCallback((command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<boolean> => {
    return new Promise((resolve) => {
      const timeoutMs = options?.timeout ?? 5000;
      const child = spawn(command, args, {
        cwd: options?.cwd,
        stdio: 'ignore', // Don't capture output, just check exit code
        detached: false,
      });

      const timer = setTimeout(() => {
        child.kill();
        resolve(false);
      }, timeoutMs);

      child.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });

      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve(code === 0);
      });
    });
  }, []);

  const checkDocker = useCallback((): Promise<boolean> => {
    return runCommand('docker', ['info'], { timeout: 5000 });
  }, [runCommand]);

  const checkLocalStack = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      fetch('http://localhost:4566/_localstack/health', {
        signal: AbortSignal.timeout(2000),
      })
        .then(response => resolve(response.ok))
        .catch(() => resolve(false));
    });
  }, []);

  const startContainers = useCallback(async (): Promise<boolean> => {
    const ok = await runCommand('docker', ['compose', '-f', 'local/docker-compose.yml', 'up', '-d'], {
      cwd: rootDir,
      timeout: 120000,
    });

    if (!ok) return false;

    // Wait for LocalStack - poll with short intervals
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const response = await fetch('http://localhost:4566/_localstack/health', {
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) return true;
      } catch {
        // Not ready yet
      }
    }
    return false;
  }, [runCommand]);

  const checkPostgres = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      const containerNames = ['workshop-postgres', 'local-postgres-1', 'postgres'];
      let attempts = 0;

      const tryNext = () => {
        if (attempts >= containerNames.length * 3) {
          resolve(true); // Continue anyway
          return;
        }

        const name = containerNames[attempts % containerNames.length];
        attempts++;

        runCommand('docker', ['exec', name, 'pg_isready', '-U', 'postgres'], { timeout: 2000 })
          .then((ok) => {
            if (ok) resolve(true);
            else setTimeout(tryNext, 300);
          });
      };

      tryNext();
    });
  }, [runCommand]);

  // Boot Sequence - simple interval-based approach for reliable rendering
  useEffect(() => {
    let cancelled = false;
    let stepIndex = 0;
    const systemReadyIndex = INITIAL_BOOT_LOGS.length - 1;

    // Track async check results
    const checkResults: Record<string, boolean | null> = {
      docker: null,
      localstack: null,
      postgres: null,
    };

    const setLogStatus = (index: number, status: BootLogStatus, message?: string) => {
      if (cancelled) return;
      setBootLogs(logs => logs.map((log, i) =>
        i === index ? { ...log, status, message: message || log.message } : log
      ));
    };

    // Start all system checks in background immediately
    checkDocker().then(ok => { checkResults.docker = ok; });
    checkLocalStack().then(ok => { checkResults.localstack = ok; });
    checkPostgres().then(ok => { checkResults.postgres = ok; });

    // Process one step at a time using interval (keeps event loop free)
    const processStep = () => {
      if (cancelled || stepIndex >= INITIAL_BOOT_LOGS.length) {
        return false; // Done
      }

      const log = INITIAL_BOOT_LOGS[stepIndex];
      const currentIndex = stepIndex;

      // Handle based on log type
      if (!log.isRealCheck) {
        // Kosmetischer Boot-Schritt (kein echter Check): kurz running, dann done
        setLogStatus(currentIndex, 'running');
        setCurrentStep(currentIndex);
        setTimeout(() => {
          if (!cancelled) {
            setLogStatus(currentIndex, 'done');
          }
        }, 150);
        stepIndex++;
        return true;
      }

      // Real system checks
      if (log.message.includes('Docker')) {
        setLogStatus(currentIndex, 'running');
        setLogStatus(systemReadyIndex, 'running');
        setCurrentStep(currentIndex);

        if (checkResults.docker === null) {
          return true; // Still waiting, try again next interval
        }

        if (!checkResults.docker) {
          setLogStatus(currentIndex, 'error', 'Docker nicht gestartet!');
          setLogStatus(systemReadyIndex, 'error', 'System-Check fehlgeschlagen');
          setError('Docker Desktop muss laufen. Bitte starte Docker und versuche es erneut.');
          return false; // Stop
        }

        setLogStatus(currentIndex, 'done', 'Docker OK');
        stepIndex++;
        return true;
      }

      if (log.message.includes('LocalStack')) {
        setLogStatus(currentIndex, 'running');
        setCurrentStep(currentIndex);

        if (checkResults.localstack === null) {
          return true; // Still waiting
        }

        if (!checkResults.localstack) {
          // Try starting containers
          setLogStatus(currentIndex, 'running', 'Starte Container...');
          startContainers().then(ok => {
            checkResults.localstack = ok;
          });
          checkResults.localstack = null; // Reset to wait again
          return true;
        }

        setLogStatus(currentIndex, 'done', 'LocalStack OK');
        stepIndex++;
        return true;
      }

      if (log.message.includes('Postgres')) {
        setLogStatus(currentIndex, 'running');
        setCurrentStep(currentIndex);

        if (checkResults.postgres === null) {
          return true; // Still waiting
        }

        setLogStatus(currentIndex, 'done', 'Postgres OK');
        stepIndex++;
        return true;
      }

      if (log.message.includes('Verifying')) {
        setLogStatus(currentIndex, 'done', 'System bereit!');
        stepIndex++;
        return true;
      }

      stepIndex++;
      return true;
    };

    // Run steps with interval - this keeps the event loop free for spinner animation
    const intervalId = setInterval(() => {
      const continueRunning = processStep();
      if (!continueRunning || stepIndex >= INITIAL_BOOT_LOGS.length) {
        clearInterval(intervalId);
        if (!cancelled && stepIndex >= INITIAL_BOOT_LOGS.length) {
          setTimeout(() => setShowMenu(true), 300);
        }
      }
    }, 200); // 200ms between steps

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Menu Navigation - isActive ensures this handler only runs when menu is visible
  useInput((input, key) => {
    if (key.upArrow || key.downArrow) {
      setSelectedOption(prev => (prev === 0 ? 1 : 0));
    }
    if (key.return) {
      if (selectedOption === 0) onStart();
      else onExit();
    }
  }, { isActive: showMenu });

  // Boot Sequence View
  if (!showMenu) {
    // Filter out pending logs and create stable keys
    const visibleLogs = bootLogs
      .map((log, originalIndex) => ({ ...log, originalIndex }))
      .filter(log => log.status !== 'pending');

    return (
      <Box flexDirection="column" padding={2}>
        <Gradient name="retro">
          <BigText text="INITIALIZING" font="tiny" />
        </Gradient>
        <Box flexDirection="column" marginTop={1}>
          {visibleLogs.map((log) => {
            let icon: React.ReactNode;
            let color: string;

            switch (log.status) {
              case 'running':
                icon = <Spinner type="dots" />;
                color = 'cyan';
                break;
              case 'done':
                icon = <Text color="green">✓</Text>;
                color = 'green';
                break;
              case 'error':
                icon = <Text color="red">✗</Text>;
                color = 'red';
                break;
              default:
                icon = <Text> </Text>;
                color = 'gray';
            }

            return (
              <Box key={`boot-log-${log.originalIndex}`}>
                <Text color="gray">[{new Date().toLocaleTimeString()}]</Text>
                <Text> </Text>
                <Box width={2}>{icon}</Box>
                <Text color={color}> {log.message}</Text>
              </Box>
            );
          })}
        </Box>

        {error && (
          <Box marginTop={2} flexDirection="column">
            <Text color="red" bold>Boot fehlgeschlagen!</Text>
            <Text color="yellow">{error}</Text>
            <Box marginTop={1}>
              <Text dimColor>Drücke Ctrl+C zum Beenden</Text>
            </Box>
          </Box>
        )}
      </Box>
    );
  }

  // HUD Menu View - height="100%" and width="100%" for full terminal
  return (
    <Box flexDirection="column" paddingX={4} paddingY={2} borderStyle="double" borderColor="cyan" height="100%" width="100%">
      <Box justifyContent="center" marginBottom={1}>
        <Gradient name="morning">
          <BigText text="AWS CDK" font={isCompact ? "tiny" : "block"} />
        </Gradient>
      </Box>

      <Box justifyContent="center" marginBottom={isCompact ? 1 : 2}>
        <Text color="cyan" dimColor>SERVERLESS TRAINING ENVIRONMENT</Text>
      </Box>

      <Box justifyContent="center" marginBottom={isCompact ? 1 : 2}>
        <Box borderStyle="round" borderColor="gray" paddingX={2} paddingY={1} flexDirection="column" width={isCompact ? 80 : 64}>
          <Text bold color="yellow" underline>MISSION OBJECTIVES</Text>
          {isCompact ? (
            // Two-column layout for small terminals
            <Box marginTop={1} flexDirection="row" justifyContent="space-between">
              <Box flexDirection="column">
                <Text><Text color="green" bold>Worker Pattern</Text> <Text dimColor>(Self-Triggering)</Text></Text>
                <Text><Text color="green" bold>Dead Letter Queues</Text> <Text dimColor>(Error Handling)</Text></Text>
              </Box>
              <Box flexDirection="column">
                <Text><Text color="green" bold>LocalStack</Text> <Text dimColor>(Local AWS)</Text></Text>
                <Text><Text color="green" bold>Structured Logging</Text> <Text dimColor>(Observability)</Text></Text>
              </Box>
            </Box>
          ) : (
            // Full layout with descriptions
            <Box marginTop={1} flexDirection="column">
              <Text>  <Text color="green" bold>Worker Pattern</Text> (Self-Triggering Lambda)</Text>
              <Text>  <Text color="green" bold>Dead Letter Queues</Text> (Error Handling)</Text>
              <Text>  <Text color="green" bold>LocalStack</Text> (Local AWS Development)</Text>
              <Text>  <Text color="green" bold>Structured Logging</Text> (Observability)</Text>
            </Box>
          )}
        </Box>
      </Box>

      <Box flexDirection="column" alignItems="center">
        <Text color={selectedOption === 0 ? "cyan" : "gray"} bold={selectedOption === 0}>
          {selectedOption === 0 ? "> " : "  "}[ PROVISION INFRASTRUCTURE ]
        </Text>
        <Text color={selectedOption === 1 ? "red" : "gray"} bold={selectedOption === 1}>
          {selectedOption === 1 ? "> " : "  "}[ ABORT MISSION ]
        </Text>
      </Box>

      <Box marginTop={2} justifyContent="space-between" borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} borderColor="gray">
        <Text dimColor>STATUS: <Text color="green">CONNECTED</Text></Text>
        <Text dimColor>v1.0.0</Text>
      </Box>
    </Box>
  );
};
