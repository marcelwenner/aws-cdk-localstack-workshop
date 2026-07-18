/**
 * DashboardScreen - Live Architecture Dashboard ("Mission Control")
 *
 * Visualizes the serverless architecture with live metrics.
 * User can trigger test scenarios to see how the system reacts.
 *
 * Features:
 * - Live polling of SQS queue metrics (every 1s)
 * - Visual feedback when worker is active
 * - Action buttons to trigger test runs
 * - Graceful degradation when infrastructure is missing
 * - CINEMATIC: Animated particles flowing through pipes
 * - Speed toggle between Real Speed and Demo Mode
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { CinematicDiagram, createEvent, type MessageEvent, type ServiceStatus } from '../components/dashboard/index.js';
import { MissionControl, MissionAction } from '../components/display/MissionControl.js';
import { DeploymentPipeline } from '../components/display/DeploymentPipeline.js';
import { useArchitectureMetrics } from '../hooks/useArchitectureMetrics.js';
import { useReactiveLoop } from '../hooks/useReactiveLoop.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { useDemoMode } from '../hooks/useDemoMode.js';
import { AwsInfrastructure } from '../core/infrastructure/aws-infrastructure.js';
import { workshopConfig } from '../core/config/workshop.config.js';
import { generateChaosMessages, sleep } from '../lib/chaos-generator.js';

export interface DashboardScreenProps {
  phase: number;
  onBack: () => void;
  onAction?: () => void; // Callback wenn Action ausgeführt wird (für Quest-Logik)
  onCdkGuide?: () => void; // Callback für CDK Guide Navigation
}

const infrastructure = new AwsInfrastructure();

// Action configurations per phase
const phaseActions: Record<number, MissionAction[]> = {
  1: ['run'],  // Phase 1: GetTableList (fertig)
  2: ['run'],  // Phase 2: MarkingStarter (User implementiert)
  3: ['run', 'stress', 'chaos'],
  4: ['run', 'stress', 'chaos'],
  5: ['run', 'stress', 'chaos'],
  6: ['run', 'stress', 'chaos'],
};

// Compact mode threshold
const COMPACT_HEIGHT = 35;

// Required Lambdas per phase - only Lambdas from PREVIOUS phases (progressive deploy)
// Dashboard shows after successful validation, when user has deployed their Lambda
const phasePrerequisites: Record<number, string[]> = {
  1: [workshopConfig.lambdas.GetTableList], // Phase 1: GetTableList pre-built
  2: [workshopConfig.lambdas.GetTableList, workshopConfig.lambdas.MarkingStarter], // Phase 2 complete: MarkingStarter deployed
  3: [workshopConfig.lambdas.GetTableList, workshopConfig.lambdas.MarkingStarter, workshopConfig.lambdas.LtsExecutor], // Phase 3 complete
  4: [workshopConfig.lambdas.GetTableList, workshopConfig.lambdas.MarkingStarter, workshopConfig.lambdas.LtsExecutor, workshopConfig.lambdas.StatusPoller], // Phase 4 complete
  5: [workshopConfig.lambdas.GetTableList, workshopConfig.lambdas.MarkingStarter, workshopConfig.lambdas.LtsExecutor, workshopConfig.lambdas.StatusPoller], // Phase 5: All 4
  6: [workshopConfig.lambdas.GetTableList, workshopConfig.lambdas.MarkingStarter, workshopConfig.lambdas.LtsExecutor, workshopConfig.lambdas.StatusPoller], // Phase 6: Stretch
};

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  phase,
  onBack,
  onAction,
  onCdkGuide,
}) => {
  const terminalSize = useTerminalSize();
  const metrics = useArchitectureMetrics({ enabled: true });
  // Phase 4+: also watch the status-check-queue - "delayed" messages ARE the backoff!
  const statusMetrics = useArchitectureMetrics({
    queueName: workshopConfig.queues.statusCheck,
    enabled: phase >= 4,
  });
  const [runningAction, setRunningAction] = useState<MissionAction | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [events, setEvents] = useState<MessageEvent[]>([]);
  const [showActiveState, setShowActiveState] = useState(false); // Keep services "active" for visual effect
  const [lastActionError, setLastActionError] = useState(false); // Track if last action failed
  const [missingLambdas, setMissingLambdas] = useState<string[]>([]);
  const [checkingPrereqs, setCheckingPrereqs] = useState(true);

  // Check prerequisites on mount
  useEffect(() => {
    const checkPrerequisites = async () => {
      const required = phasePrerequisites[phase] || [];
      const missing: string[] = [];

      for (const lambdaName of required) {
        const exists = await infrastructure.lambdaExists(lambdaName);
        if (!exists) {
          missing.push(lambdaName);
        }
      }

      setMissingLambdas(missing);
      setCheckingPrereqs(false);

      if (missing.length > 0) {
        setStatusMessage(`[!] ${missing.length} Lambda(s) nicht deployed - gehe zum CDK Guide`);
      }
    };

    checkPrerequisites();
  }, [phase]);

  // Demo mode for slower animations
  const demoMode = useDemoMode({ toggleKey: 's', enableKeyboard: true });

  // ReactiveLoop für Live-Deploy-Status
  const phaseInfo = workshopConfig.phases.find(p => p.id === phase);
  const reactiveLoop = useReactiveLoop({
    watchPaths: phaseInfo?.watchPaths || [],
    phase,
    enabled: true,
  });

  const isCompact = terminalSize.rows < COMPACT_HEIGHT;
  const availableActions = phaseActions[phase] || ['run'];

  // Derive service states from metrics and running action
  const getServiceStates = useCallback((): {
    trigger: ServiceStatus;
    starter: ServiceStatus;
    worker: ServiceStatus;
  } => {
    const isRunning = runningAction !== null;
    const isProcessing = metrics.queue.inFlight > 0;
    const hasConnectionError = metrics.connectionStatus === 'disconnected';

    // After error: show error state, not active state
    if (lastActionError && showActiveState) {
      return {
        trigger: 'active', // Trigger was clicked
        starter: 'error',  // Starter failed!
        worker: 'idle',    // Nothing after starter
      };
    }

    // Success cooldown: show active state
    if (showActiveState && !lastActionError) {
      return {
        trigger: 'active',
        starter: 'active',
        worker: isProcessing ? 'active' : 'idle',
      };
    }

    // Currently running - use 'running' status (yellow) to indicate outcome unknown
    if (isRunning) {
      return {
        trigger: 'running',
        starter: 'running',  // Running, but outcome unknown - yellow!
        worker: 'idle',      // Don't activate downstream until we know result
      };
    }

    // Idle state
    return {
      trigger: 'idle',
      starter: hasConnectionError ? 'error' : 'idle',
      worker: isProcessing ? 'active' : hasConnectionError ? 'error' : 'idle',
    };
  }, [runningAction, showActiveState, lastActionError, metrics.queue.inFlight, metrics.connectionStatus]);

  // Calculate throughput from inFlight changes (debounced to reduce flicker)
  const prevInFlightRef = useRef(0);
  const throughputRef = useRef(0);
  const [throughput, setThroughput] = useState(0);

  useEffect(() => {
    // Update throughput calculation on interval instead of every change
    const interval = setInterval(() => {
      const delta = Math.abs(metrics.queue.inFlight - prevInFlightRef.current);
      if (delta > 0) {
        throughputRef.current = throughputRef.current * 0.7 + delta * 0.3 * 2;
      } else {
        throughputRef.current = throughputRef.current * 0.9;
      }
      prevInFlightRef.current = metrics.queue.inFlight;

      // Only update state if significant change (reduces re-renders)
      const roundedThroughput = Math.round(throughputRef.current * 10) / 10;
      setThroughput(prev => {
        const roundedPrev = Math.round(prev * 10) / 10;
        return roundedPrev !== roundedThroughput ? roundedThroughput : prev;
      });
    }, 500); // Update every 500ms instead of on every change

    return () => clearInterval(interval);
  }, [metrics.queue.inFlight]);

  // Add event helper
  const addEvent = useCallback((type: MessageEvent['type'], message: string, options?: { duration?: number; error?: string }) => {
    setEvents(prev => [...prev.slice(-19), createEvent(type, message, options)]);
  }, []);

  /**
   * Execute an action
   */
  const executeAction = useCallback(async (action: MissionAction) => {
    if (runningAction) return;

    setRunningAction(action);
    setLastActionError(false); // Reset error state
    onAction?.(); // Callback für Quest-Logik

    let hadError = false;

    try {
      switch (action) {
        case 'run': {
          addEvent('action', 'Standard Run gestartet');
          setStatusMessage('🚀 Standard Run gestartet...');

          if (phase === 1) {
            // Phase 1: GetTableList (fertige Lambda zum Verstehen)
            const startTime = Date.now();
            addEvent('processing', 'GetTableList wird aufgerufen...');
            const result = await infrastructure.invokeLambda(workshopConfig.lambdas.GetTableList);
            const duration = Date.now() - startTime;

            if (result.success) {
              setStatusMessage('✅ GetTableList erfolgreich');
              addEvent('completed', 'GetTableList erfolgreich', { duration });
            } else {
              hadError = true;
              if (result.error?.includes('Function not found') || result.error?.includes('ResourceNotFoundException')) {
                setStatusMessage('❌ Lambda nicht gefunden - Warte auf Auto-Deploy oder prüfe deinen Code');
                addEvent('failed', 'Lambda nicht deployed', { error: 'Auto-Deploy läuft...' });
              } else {
                setStatusMessage(`❌ Fehler: ${result.error || 'Unknown'}`);
                addEvent('failed', 'GetTableList fehlgeschlagen', { error: result.error || 'Unknown' });
              }
            }
          } else {
            // Phase 2+: MarkingStarter (User implementiert)
            const startTime = Date.now();
            addEvent('processing', 'MarkingStarter wird aufgerufen...');
            const result = await infrastructure.invokeLambda(workshopConfig.lambdas.MarkingStarter, {
              action: 'startMarking',
              tableCount: 10,
            });
            const duration = Date.now() - startTime;

            if (result.success) {
              setStatusMessage('✅ 10 Tabellen in Queue geschickt');
              addEvent('sent', '10 Tabellen in Queue geschickt', { duration });
            } else {
              hadError = true;
              // Check for specific error types
              if (result.error?.includes('NOT_IMPLEMENTED')) {
                setStatusMessage('❌ NOT_IMPLEMENTED - Implementiere die Lambda und komm zurück!');
                addEvent('failed', 'NOT_IMPLEMENTED', { error: 'Lambda muss implementiert werden' });
              } else if (result.error?.includes('Function not found') || result.error?.includes('ResourceNotFoundException')) {
                setStatusMessage('❌ Lambda nicht gefunden - Warte auf Auto-Deploy oder prüfe deinen Code');
                addEvent('failed', 'Lambda nicht deployed', { error: 'Auto-Deploy läuft...' });
              } else {
                setStatusMessage(`❌ Fehler: ${result.error || 'Unknown'}`);
                addEvent('failed', 'MarkingStarter fehlgeschlagen', { error: result.error || 'Unknown' });
              }
            }
          }
          break;
        }

        case 'stress': {
          addEvent('action', 'Stress Test: 100 Tabellen');
          setStatusMessage('🔥 Stress Test gestartet (100 Tabellen)...');

          const startTime = Date.now();
          addEvent('processing', 'MarkingStarter wird aufgerufen (100x)...');
          const result = await infrastructure.invokeLambda(workshopConfig.lambdas.MarkingStarter, {
            action: 'startMarking',
            tableCount: 100,
          });
          const duration = Date.now() - startTime;

          if (result.success) {
            setStatusMessage('✅ 100 Tabellen in Queue - beobachte die Queue!');
            addEvent('sent', '100 Tabellen in Queue!', { duration });
          } else {
            hadError = true;
            if (result.error?.includes('NOT_IMPLEMENTED')) {
              setStatusMessage('❌ NOT_IMPLEMENTED - Implementiere die Lambda und komm zurück!');
              addEvent('failed', 'NOT_IMPLEMENTED', { error: 'Lambda muss implementiert werden' });
            } else if (result.error?.includes('Function not found') || result.error?.includes('ResourceNotFoundException')) {
              setStatusMessage('❌ Lambda nicht gefunden - Warte auf Auto-Deploy oder prüfe deinen Code');
              addEvent('failed', 'Lambda nicht deployed', { error: 'Auto-Deploy läuft...' });
            } else {
              setStatusMessage(`❌ Fehler: ${result.error || 'Unknown'}`);
              addEvent('failed', 'Stress Test fehlgeschlagen', { error: result.error || 'Unknown' });
            }
          }
          break;
        }

        case 'chaos': {
          setStatusMessage('🌪️ Chaos Monkey: Injiziere 50 Messages (10 Poison Pills)...');
          addEvent('action', 'Chaos Monkey aktiviert!');

          // Get queue URL
          const queueUrl = await infrastructure.getQueueUrl('lts-worker-queue');
          if (!queueUrl) {
            hadError = true;
            setStatusMessage('❌ Queue nicht gefunden - wurde CDK deployed?');
            addEvent('failed', 'Queue nicht gefunden', { error: 'CDK nicht deployed?' });
            break;
          }

          // Generate chaos messages with variety pack
          const messages = generateChaosMessages(50, 10);
          let sent = 0;

          // Send messages sequentially for visual effect
          for (const msg of messages) {
            try {
              await infrastructure.sendMessage(queueUrl, msg.payload);
              sent++;
              // Update status every 10 messages
              if (sent % 10 === 0) {
                setStatusMessage(`🌪️ Chaos: ${sent}/50 gesendet...`);
                addEvent('sent', `${sent}/50 Messages gesendet`);
              }
              await sleep(50); // 50ms delay for visual effect
            } catch (err) {
              hadError = true;
              setStatusMessage(`❌ Fehler beim Senden: ${err instanceof Error ? err.message : 'Unknown'}`);
              addEvent('failed', 'Fehler beim Senden', { error: err instanceof Error ? err.message : 'Unknown' });
              break;
            }
          }

          if (sent === 50) {
            // Echte Poison Pills brauchen 3 × VisibilityTimeout (900s) bis zur DLQ,
            // also ~45 min. Für den Workshop seeden wir die DLQ zusätzlich direkt
            // mit ehrlich gelabelten Beispielen - der echte Crash ist live im Log.
            const dlqUrl = await infrastructure.getQueueUrl('lts-worker-queue-dlq');
            if (dlqUrl) {
              for (let i = 1; i <= 3; i++) {
                await infrastructure.sendMessage(dlqUrl, {
                  taskType: 'marking',
                  taskId: -i,
                  kaputt: true,
                  _workshopHinweis: 'Simuliert: nach 3 fehlgeschlagenen Zustellversuchen hierher verschoben (real dauert das 3 × VisibilityTimeout)',
                });
              }
            }
            setStatusMessage('💀 Poison Pills injiziert - Worker crasht (Logs!), DLQ gefüllt!');
            addEvent('dlq', 'Poison Pills injiziert - Logs + DLQ ansehen!');
          }
          break;
        }
      }
    } catch (error) {
      hadError = true;
      setStatusMessage(`❌ ${error instanceof Error ? error.message : 'Unknown error'}`);
      addEvent('failed', 'Unbekannter Fehler', { error: error instanceof Error ? error.message : 'Unknown' });
    } finally {
      setRunningAction(null);
      setLastActionError(hadError);
      // Keep services visually in state for a cooldown period (longer in demo mode)
      setShowActiveState(true);
      const cooldownTime = demoMode.demoMode ? 3000 : 1500;
      setTimeout(() => {
        setShowActiveState(false);
        setLastActionError(false); // Clear error after cooldown
      }, cooldownTime);
    }
  }, [phase, runningAction, onAction, addEvent, demoMode.demoMode]);

  /**
   * Handle keyboard input
   */
  useInput((input, key) => {
    // Back navigation
    if (input.toLowerCase() === 'q' || key.escape) {
      onBack();
      return;
    }

    // CDK Guide shortcut
    if (input.toLowerCase() === 'c' && onCdkGuide) {
      onCdkGuide();
      return;
    }

    // Action keys (only if no missing lambdas)
    if (missingLambdas.length > 0) return;

    if (input === '1' && availableActions.includes('run')) {
      executeAction('run');
    } else if (input === '2' && availableActions.includes('stress')) {
      executeAction('stress');
    } else if (input === '3' && availableActions.includes('chaos')) {
      executeAction('chaos');
    }
  });

  // Build cinematic metrics
  const cinematicMetrics = {
    queue: {
      depth: metrics.queue.depth,
      inFlight: metrics.queue.inFlight,
      dlqDepth: metrics.queue.dlqDepth,
    },
    throughput,
    serviceStates: getServiceStates(),
    // Live backoff data for phase 4 (delayed = Messages die mit DelaySeconds warten)
    ...(phase >= 4 && {
      backoff: {
        delayed: statusMetrics.queue.delayed,
        inFlight: statusMetrics.queue.inFlight,
        online: statusMetrics.queue.status === 'online',
      },
    }),
  };

  // Compact layout for small terminals
  if (isCompact) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box justifyContent="space-between">
          <Text bold color="cyan">🎬 Live Architecture (Phase {phase})</Text>
          <Text color={demoMode.demoMode ? 'yellow' : 'green'}>
            {demoMode.icon} {demoMode.label}
          </Text>
        </Box>
        {/* Deployment Pipeline (kompakt) */}
        <DeploymentPipeline state={reactiveLoop} watching={reactiveLoop.watching} forceMinimized />
        <Box marginY={1}>
          <CinematicDiagram
            phase={phase}
            metrics={cinematicMetrics}
            demoMode={demoMode.demoMode}
            events={events}
          />
        </Box>
        {/* Prerequisites Warning (compact) */}
        {missingLambdas.length > 0 && !checkingPrereqs && (
          <Box marginY={1}>
            <Text color="yellow">[!] {missingLambdas.length} Lambda(s) fehlen - [C] CDK Guide</Text>
          </Box>
        )}
        <MissionControl
          actions={availableActions}
          runningAction={runningAction}
          compact
          disabled={runningAction !== null || missingLambdas.length > 0}
        />
      </Box>
    );
  }

  // Full layout
  return (
    <Box flexDirection="column" height="100%" padding={1}>
      {/* Header */}
      <Box
        borderStyle="double"
        borderColor="cyan"
        paddingX={1}
        flexShrink={0}
        justifyContent="space-between"
      >
        <Box gap={2}>
          <Text bold color="cyan">
            🎬 LIVE ARCHITECTURE
          </Text>
          <Text color="white">Phase {phase}</Text>
          {metrics.connectionStatus === 'connected' && (
            <Text color="green">● Online</Text>
          )}
          {metrics.connectionStatus === 'disconnected' && (
            <Text color="red">● Offline</Text>
          )}
        </Box>
        <Box gap={2}>
          <Text>
            <Text color={demoMode.demoMode ? 'yellow' : 'green'}>{demoMode.icon} {demoMode.label}</Text>
            <Text dimColor>{` │ `}</Text>
            <Text color="cyan">{throughput.toFixed(1)} msg/s</Text>
          </Text>
        </Box>
      </Box>

      {/* Prerequisites Warning */}
      {missingLambdas.length > 0 && !checkingPrereqs && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="yellow"
          paddingX={2}
          paddingY={1}
          marginY={1}
        >
          <Text bold color="yellow">[!] Lambdas nicht deployed!</Text>
          <Box flexDirection="column" marginTop={1}>
            {missingLambdas.map((name) => (
              <Text key={`missing-lambda-${name}`} color="red">X {name}</Text>
            ))}
          </Box>
          <Box marginTop={1}>
            <Text>
              <Text dimColor>Gehe zum </Text>
              <Text color="cyan" bold>[C] CDK Guide</Text>
              <Text dimColor> um die Lambdas zu deployen</Text>
            </Text>
          </Box>
        </Box>
      )}

      {/* Architecture Diagram */}
      <Box
        flexGrow={1}
        justifyContent="center"
        alignItems="center"
        borderStyle="round"
        borderColor="gray"
        marginY={1}
        paddingY={1}
      >
        <CinematicDiagram
          phase={phase}
          metrics={cinematicMetrics}
          demoMode={demoMode.demoMode}
          events={events}
        />
      </Box>

      {/* Deployment Pipeline */}
      <Box flexShrink={0} marginBottom={1}>
        <DeploymentPipeline state={reactiveLoop} watching={reactiveLoop.watching} />
      </Box>

      {/* Mission Control */}
      <Box flexShrink={0}>
        <MissionControl
          actions={availableActions}
          runningAction={runningAction}
          statusMessage={statusMessage}
          disabled={runningAction !== null || missingLambdas.length > 0}
        />
      </Box>

      {/* Keyboard Hints */}
      <Box justifyContent="center" marginTop={1} gap={2}>
        <Text dimColor>[S] Speed Toggle</Text>
        {onCdkGuide && <Text dimColor>[C] CDK Guide</Text>}
        <Text dimColor>[Q] Zurück</Text>
      </Box>
    </Box>
  );
};
