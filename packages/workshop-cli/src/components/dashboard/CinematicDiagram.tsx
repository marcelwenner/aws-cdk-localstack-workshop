import React, { useRef, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { ServiceNode, type ServiceStatus } from './ServiceNode.js';
import { ParticleStream } from './ParticleStream.js';
import { QueueVisualization } from './QueueVisualization.js';
import { DlqIndicator } from './DlqIndicator.js';
import { LiveEventFeed, createEvent, type MessageEvent } from './LiveEventFeed.js';
import { useParticleSystem } from '../../hooks/useParticleSystem.js';

export interface CinematicMetrics {
  queue: {
    depth: number;
    inFlight: number;
    dlqDepth: number;
  };
  throughput: number;
  serviceStates: {
    trigger: ServiceStatus;
    starter: ServiceStatus;
    worker: ServiceStatus;
  };
  /** Phase 4: LIVE metrics of the status-check-queue (delayed = Messages im Backoff!) */
  backoff?: {
    delayed: number;
    inFlight: number;
    online: boolean;
  };
}

export interface CinematicDiagramProps {
  /** Current phase (affects which services are shown) */
  phase: number;
  /** Live metrics */
  metrics: CinematicMetrics;
  /** Demo mode slows animations */
  demoMode?: boolean;
  /** Animation speed in ms */
  animationSpeed?: number;
  /** Events for the live feed */
  events?: MessageEvent[];
  /** Callback when an action triggers particle spawn */
  onParticleBurst?: () => void;
}

/**
 * Phase-specific learning focus labels
 */
const PHASE_LABELS: Record<number, { title: string; concept: string }> = {
  1: { title: 'DB Adapter Pattern', concept: 'Lambda liest aus Datenbank' },
  2: { title: 'Fan-Out Pattern', concept: '1 Request → viele SQS Messages' },
  3: { title: 'Worker + DLQ', concept: 'Async Processing mit Fehlerbehandlung' },
  4: { title: 'Exponential Backoff', concept: 'Delay: 5s → 10s → 20s → 40s' },
  5: { title: 'Observability', concept: 'Logs, Metrics, Traces' },
  6: { title: 'Production Ready', concept: 'Alles zusammen!' },
};

// ============================================================================
// Fixed-column layout for the full architecture (phases 3/4/6).
// Every row lives in a fixed-width box so connectors align at EVERY
// terminal width (the whole block is centered as one unit).
//
//   col: 0         11        20        31        40              57
//        [TRIGGER ] ═══o════> [STARTER] ═══o════> [    QUEUE     ]
//                                                       │ (col 48)
//        [   DB   ] <════o═══ [WORKER ] <═══o══════════╯
//                                  │ (col 25)
//                             [  DLQ  ]  (col 20)
// ============================================================================
const NODE_W = 11;       // ServiceNode default width
const PIPE_LEN = 8;      // stream chars (+1 arrow char)
const QUEUE_W = 18;      // QueueVisualization width
const DIAGRAM_W = NODE_W + (PIPE_LEN + 1) + NODE_W + (PIPE_LEN + 1) + QUEUE_W; // 58
const QUEUE_CENTER = NODE_W + (PIPE_LEN + 1) + NODE_W + (PIPE_LEN + 1) + Math.floor(QUEUE_W / 2) - 1; // 48
const WORKER_LEFT = NODE_W + (PIPE_LEN + 1); // 20
const WORKER_CENTER = WORKER_LEFT + Math.floor(NODE_W / 2); // 25
// return pipe: from worker right edge to under the queue center
const RETURN_PIPE_LEN = QUEUE_CENTER - (WORKER_LEFT + NODE_W) - 1; // 16 ('<' + 16 = cols 31..47)

/**
 * CinematicDiagram - Progressive Architecture Visualization
 *
 * Each phase progressively reveals more of the architecture:
 * - Phase 1: TRIGGER → LAMBDA → DB (simple flow)
 * - Phase 2: + Queue counter appears (fan-out preview)
 * - Phase 3: + WORKER + DLQ (full architecture)
 * - Phase 4: + Live backoff panel (status-check-queue: delayed messages)
 * - Phase 5: + Prominent log stream (observability focus)
 * - Phase 6: Full architecture with take-home checklist
 */
export const CinematicDiagram: React.FC<CinematicDiagramProps> = ({
  phase,
  metrics,
  demoMode = false,
  animationSpeed = 150,
  events = [],
}) => {
  const speed = demoMode ? animationSpeed * 4 : animationSpeed;
  const frameInterval = demoMode ? 200 : 50;

  // Track DLQ changes for error particles
  const prevDlqRef = useRef(metrics.queue.dlqDepth);
  const dlqDelta = metrics.queue.dlqDepth - prevDlqRef.current;

  useEffect(() => {
    prevDlqRef.current = metrics.queue.dlqDepth;
  }, [metrics.queue.dlqDepth]);

  // Check if any service is active or running
  const isActive = metrics.serviceStates.trigger === 'active' ||
                   metrics.serviceStates.trigger === 'running' ||
                   metrics.serviceStates.starter === 'active' ||
                   metrics.serviceStates.starter === 'running' ||
                   metrics.serviceStates.worker === 'active';

  // Particle system
  const particleSystem = useParticleSystem({
    throughput: metrics.throughput,
    inFlight: metrics.queue.inFlight,
    dlqDelta: dlqDelta > 0 ? dlqDelta : 0,
    demoMode,
    frameInterval,
    isActive,
  });

  // Internal events state (derived from metrics changes)
  const [internalEvents, setInternalEvents] = useState<MessageEvent[]>([]);
  const prevMetricsRef = useRef(metrics);

  useEffect(() => {
    const prev = prevMetricsRef.current;

    // Detect metric changes and create events
    if (metrics.queue.inFlight > prev.queue.inFlight) {
      setInternalEvents(evts => [
        ...evts.slice(-19),
        createEvent('processing', 'Message dequeued, processing...'),
      ]);
    }

    if (metrics.queue.inFlight < prev.queue.inFlight && prev.queue.inFlight > 0) {
      setInternalEvents(evts => [
        ...evts.slice(-19),
        createEvent('completed', 'Message processed', { duration: 1200 }),
      ]);
    }

    if (metrics.queue.dlqDepth > prev.queue.dlqDepth) {
      setInternalEvents(evts => [
        ...evts.slice(-19),
        createEvent('dlq', 'POISON PILL → DLQ', { error: 'processing failed' }),
      ]);
    }

    prevMetricsRef.current = metrics;
  }, [metrics]);

  // Combine external and internal events
  const allEvents = [...events, ...internalEvents];

  // Get phase label
  const phaseLabel = PHASE_LABELS[phase] || PHASE_LABELS[6];

  // Render phase header with learning focus
  const renderPhaseHeader = () => (
    <Box justifyContent="center" marginBottom={1}>
      <Box borderStyle="round" borderColor={isActive ? 'cyan' : 'gray'} paddingX={2}>
        <Text>
          <Text color="cyan" bold>{phaseLabel.title}</Text>
          <Text color="gray"> | </Text>
          <Text color={isActive ? 'white' : 'gray'}>{phaseLabel.concept}</Text>
        </Text>
      </Box>
    </Box>
  );

  // Centered event feed (fixed width so it doesn't jump around)
  const renderEventFeed = (maxEvents = 4) => (
    <Box marginTop={1} justifyContent="center">
      <LiveEventFeed events={allEvents} maxEvents={maxEvents} width={64} />
    </Box>
  );

  /**
   * Full architecture (phases 3/4/6) with exact column alignment.
   */
  const renderFullArchitecture = (options: {
    dlqHint?: boolean;
    backoffActive?: boolean;
  } = {}) => {
    const workerBusy = metrics.serviceStates.worker === 'active';
    const dropActive = metrics.queue.inFlight > 0 || workerBusy;
    const dlqHot = metrics.queue.dlqDepth > 0;

    return (
      <Box justifyContent="center">
        <Box flexDirection="column" width={DIAGRAM_W}>
          {/* Row 1: TRIGGER ═══> STARTER ═══> QUEUE */}
          <Box alignItems="center">
            <ServiceNode
              name="TRIGGER"
              icon="[T]"
              status={metrics.serviceStates.trigger}
              animationSpeed={speed}
            />
            <ParticleStream
              particles={particleSystem.particles}
              segment="trigger-starter"
              length={PIPE_LEN}
              direction="right"
            />
            <ServiceNode
              name="STARTER"
              icon="[S]"
              status={metrics.serviceStates.starter}
              animationSpeed={speed}
            />
            <ParticleStream
              particles={particleSystem.particles}
              segment="starter-queue"
              length={PIPE_LEN}
              direction="right"
            />
            <QueueVisualization
              depth={metrics.queue.depth}
              inFlight={metrics.queue.inFlight}
              animationSpeed={speed}
            />
          </Box>

          {/* Drop: Queue ↓ (exactly under the queue center) */}
          <Box paddingLeft={QUEUE_CENTER} flexDirection="column">
            <Text color={dropActive ? 'cyan' : 'gray'}>│</Text>
            <Text color={options.backoffActive ? 'yellow' : dropActive ? 'cyan' : 'gray'}>
              {options.backoffActive ? '↻' : dropActive ? 'o' : '│'}
            </Text>
          </Box>

          {/* Row 2: DB <═══ WORKER <══════════╯ */}
          <Box alignItems="center">
            <ServiceNode
              name="DB"
              icon="[=]"
              status={workerBusy ? 'active' : 'idle'}
              subtitle=""
            />
            <ParticleStream
              particles={particleSystem.particles}
              segment="worker-db"
              length={PIPE_LEN}
              direction="left"
            />
            <ServiceNode
              name="WORKER"
              icon="[W]"
              status={metrics.serviceStates.worker}
              animationSpeed={speed}
            />
            <ParticleStream
              particles={particleSystem.particles}
              segment="queue-worker"
              length={RETURN_PIPE_LEN}
              direction="left"
            />
            <Text color={dropActive ? 'cyan' : 'gray'}>╯</Text>
          </Box>

          {/* Drop: Worker ↓ DLQ (exactly under the worker center) */}
          <Box paddingLeft={WORKER_CENTER} flexDirection="column">
            <Text color={dlqHot ? 'red' : 'gray'}>{dlqHot ? 'x' : '│'}</Text>
            <Text color={dlqHot ? 'red' : 'gray'}>▼</Text>
          </Box>

          {/* Row 3: DLQ (under the worker) */}
          <Box>
            <Box width={WORKER_LEFT} />
            <DlqIndicator
              depth={metrics.queue.dlqDepth}
              animationSpeed={speed}
            />
            {options.dlqHint && (
              <Box flexDirection="column" justifyContent="center" marginLeft={1}>
                <Text color="yellow" dimColor>◀ NEU: Dead Letter Queue</Text>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    );
  };

  // ============================================
  // PHASE 1: Simple DB Adapter Flow
  // TRIGGER → LAMBDA → DATABASE
  // ============================================
  if (phase === 1) {
    const starterStatus = metrics.serviceStates.starter;
    const isLambdaRunning = starterStatus === 'running';  // Yellow - outcome unknown
    const isLambdaActive = starterStatus === 'active';    // Green - success!
    const isLambdaError = starterStatus === 'error';      // Red - failed!
    // ONLY show downstream active if lambda SUCCEEDED (not running, not error)
    const showDownstream = isLambdaActive && !isLambdaError;

    return (
      <Box flexDirection="column">
        {renderPhaseHeader()}

        {/* Simple Flow: Trigger -> Lambda -> DB */}
        <Box flexDirection="column" alignItems="center" paddingY={1}>
          <Box alignItems="center" gap={0}>
            <ServiceNode
              name="TRIGGER"
              icon="[T]"
              status={metrics.serviceStates.trigger}
              animationSpeed={speed}
              width={13}
            />
            <Box flexDirection="column">
              <Text color={isLambdaRunning || isLambdaActive || isLambdaError ? 'cyan' : 'gray'}> Request </Text>
              <ParticleStream
                particles={particleSystem.particles}
                segment="trigger-starter"
                length={10}
                direction="right"
              />
            </Box>
            <ServiceNode
              name="LAMBDA"
              icon="[S]"
              status={starterStatus}
              animationSpeed={speed}
              width={13}
            />
            <Box flexDirection="column">
              {/* Query shows X on error, "..." on running, lights up on success */}
              {isLambdaError ? (
                <Text color="red" bold> ✗ FAIL </Text>
              ) : isLambdaRunning ? (
                <Text color="yellow"> ... </Text>
              ) : (
                <Text color={showDownstream ? 'cyan' : 'gray'}> Query </Text>
              )}
              {isLambdaError ? (
                <Text color="red">──X──X─────</Text>
              ) : (
                <ParticleStream
                  particles={particleSystem.particles}
                  segment="starter-queue"
                  length={10}
                  direction="right"
                />
              )}
            </Box>
            <ServiceNode
              name="DATABASE"
              icon="[===]"
              status={isLambdaError ? 'idle' : showDownstream ? 'active' : 'idle'}
              animationSpeed={speed}
              width={13}
            />
          </Box>

          {/* Response Flow - only shows on SUCCESS (not running, not error) */}
          {showDownstream && (
            <Box alignItems="center" gap={0} marginTop={1}>
              <Box width={13} />
              <Box flexDirection="column">
                <ParticleStream
                  particles={particleSystem.particles}
                  segment="worker-db"
                  length={10}
                  direction="left"
                />
                <Text color="green"> Response</Text>
              </Box>
              <Box width={13} />
              <Box flexDirection="column">
                <ParticleStream
                  particles={particleSystem.particles}
                  segment="queue-worker"
                  length={10}
                  direction="left"
                />
                <Text color="green"> Tables </Text>
              </Box>
              <Box width={13} />
            </Box>
          )}
        </Box>

        {renderEventFeed()}
      </Box>
    );
  }

  // ============================================
  // PHASE 2: Fan-Out Pattern
  // Same as Phase 1 + Queue Counter (preview of what's coming)
  // ============================================
  if (phase === 2) {
    const starterStatus = metrics.serviceStates.starter;
    const isLambdaRunning = starterStatus === 'running';  // Yellow - outcome unknown
    const isLambdaActive = starterStatus === 'active';    // Green - success!
    const isLambdaError = starterStatus === 'error';      // Red - failed!
    // ONLY show downstream active if lambda SUCCEEDED (not running, not error)
    const showDownstream = isLambdaActive && !isLambdaError;

    return (
      <Box flexDirection="column">
        {renderPhaseHeader()}

        {/* Flow with Queue Preview */}
        <Box flexDirection="column" alignItems="center" paddingY={1}>
          <Box alignItems="center" gap={0}>
            <ServiceNode
              name="TRIGGER"
              icon="[T]"
              status={metrics.serviceStates.trigger}
              animationSpeed={speed}
              width={12}
            />
            <Box flexDirection="column">
              <Text color={isLambdaRunning || isLambdaActive || isLambdaError ? 'cyan' : 'gray'}> invoke </Text>
              <ParticleStream
                particles={particleSystem.particles}
                segment="trigger-starter"
                length={8}
                direction="right"
              />
            </Box>
            <ServiceNode
              name="STARTER"
              icon="[S]"
              status={starterStatus}
              animationSpeed={speed}
              width={12}
            />
            <Box flexDirection="column">
              {/* fan-out shows X on error, "..." on running, PARTICLES on success */}
              {isLambdaError ? (
                <Text color="red" bold> ✗ FAIL </Text>
              ) : isLambdaRunning ? (
                <Text color="yellow"> ... </Text>
              ) : (
                <Text color={showDownstream ? 'yellow' : 'gray'}> fan-out </Text>
              )}
              {isLambdaError ? (
                <Text color="red">──X──X───</Text>
              ) : (
                <ParticleStream
                  particles={particleSystem.particles}
                  segment="starter-queue"
                  length={8}
                  direction="right"
                />
              )}
            </Box>
            {/* Queue Preview - live counter, worker comes in phase 3 */}
            <Box
              flexDirection="column"
              alignItems="center"
              borderStyle="single"
              borderColor={isLambdaError ? 'gray' : metrics.queue.depth > 0 ? 'yellow' : 'gray'}
              paddingX={1}
            >
              <Text color={isLambdaError ? 'gray' : metrics.queue.depth > 0 ? 'yellow' : 'gray'} bold>QUEUE</Text>
              <Text color={isLambdaError ? 'gray' : metrics.queue.depth > 0 ? 'white' : 'gray'} bold={metrics.queue.depth > 0}>
                {metrics.queue.depth > 0 ? `[${metrics.queue.depth}]` : '[...]'}
              </Text>
              <Text color="gray" dimColor>Phase 3+</Text>
            </Box>
          </Box>

          {/* DB Connection - only shows on SUCCESS (not running, not error) */}
          {showDownstream && (
            <Box alignItems="center" gap={0} marginTop={1}>
              <Box width={12} />
              <Box flexDirection="column">
                <ParticleStream
                  particles={particleSystem.particles}
                  segment="worker-db"
                  length={8}
                  direction="left"
                />
                <Text color="green"> result </Text>
              </Box>
              <ServiceNode
                name="DATABASE"
                icon="[===]"
                status="active"
                animationSpeed={speed}
                width={12}
              />
            </Box>
          )}
        </Box>

        {renderEventFeed()}
      </Box>
    );
  }

  // ============================================
  // PHASE 3: Worker + DLQ (Full Architecture)
  // ============================================
  if (phase === 3) {
    return (
      <Box flexDirection="column">
        {renderPhaseHeader()}
        {renderFullArchitecture({ dlqHint: true })}
        {renderEventFeed()}
      </Box>
    );
  }

  // ============================================
  // PHASE 4: Exponential Backoff - LIVE!
  // Full architecture + live status-check-queue panel
  // ============================================
  if (phase === 4) {
    const backoff = metrics.backoff;
    const backoffActive = (backoff?.delayed ?? 0) > 0;
    // The REAL workshop formula: min(300, 5 * 2^attempt) - see queue-adapter-sqs
    const ladder = ['5s', '10s', '20s', '40s', '80s'];

    return (
      <Box flexDirection="column">
        {renderPhaseHeader()}

        {/* Live Backoff Panel - real data from the status-check-queue! */}
        <Box justifyContent="center" marginBottom={1}>
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor={backoffActive ? 'yellow' : 'gray'}
            paddingX={2}
          >
            <Text>
              <Text color={backoffActive ? 'yellow' : 'gray'} bold>↻ BACKOFF </Text>
              {ladder.map((step, idx) => (
                <Text key={step} color={backoffActive ? 'yellow' : 'gray'}>
                  {idx > 0 ? ' → ' : ''}{step}
                </Text>
              ))}
              <Text color="gray"> → … max 300s</Text>
            </Text>
            {backoff && backoff.online ? (
              <Text>
                <Text color="cyan">status-check-queue: </Text>
                <Text color={backoffActive ? 'yellow' : 'gray'} bold={backoffActive}>
                  {backoff.delayed} delayed
                </Text>
                <Text dimColor> (warten mit DelaySeconds!)</Text>
                <Text color="gray"> · </Text>
                <Text color={backoff.inFlight > 0 ? 'cyan' : 'gray'}>{backoff.inFlight} in flight</Text>
              </Text>
            ) : (
              <Text dimColor>status-check-queue offline - StatusPoller schon deployed?</Text>
            )}
          </Box>
        </Box>

        {renderFullArchitecture({ backoffActive })}
        {renderEventFeed()}
      </Box>
    );
  }

  // ============================================
  // PHASE 5: Observability Focus
  // Full architecture + Prominent Log Stream
  // ============================================
  if (phase === 5) {
    const flowActive = isActive;
    return (
      <Box flexDirection="column">
        {renderPhaseHeader()}

        {/* Compact Architecture View */}
        <Box alignItems="center" justifyContent="center" gap={1}>
          <ServiceNode
            name="TRIGGER"
            icon="[T]"
            status={metrics.serviceStates.trigger}
            animationSpeed={speed}
            width={11}
          />
          <Text color={flowActive ? 'cyan' : 'gray'}>→</Text>
          <ServiceNode
            name="STARTER"
            icon="[S]"
            status={metrics.serviceStates.starter}
            animationSpeed={speed}
            width={11}
          />
          <Text color={flowActive ? 'cyan' : 'gray'}>→</Text>
          <Box
            flexDirection="column"
            alignItems="center"
            borderStyle="single"
            borderColor={metrics.queue.depth > 0 ? 'cyan' : 'gray'}
            paddingX={1}
          >
            <Text color="gray">SQS</Text>
            <Text color={metrics.queue.depth > 0 ? 'cyan' : 'gray'} bold={metrics.queue.depth > 0}>
              {metrics.queue.depth}
            </Text>
          </Box>
          <Text color={flowActive ? 'cyan' : 'gray'}>→</Text>
          <ServiceNode
            name="WORKER"
            icon="[W]"
            status={metrics.serviceStates.worker}
            animationSpeed={speed}
            width={11}
          />
          <Text color={flowActive ? 'cyan' : 'gray'}>→</Text>
          <ServiceNode
            name="DB"
            icon="[=]"
            status={metrics.serviceStates.worker === 'active' ? 'active' : 'idle'}
            width={11}
          />
          <Box
            flexDirection="column"
            alignItems="center"
            borderStyle="single"
            borderColor={metrics.queue.dlqDepth > 0 ? 'red' : 'gray'}
            paddingX={1}
          >
            <Text color={metrics.queue.dlqDepth > 0 ? 'red' : 'gray'} bold={metrics.queue.dlqDepth > 0}>DLQ</Text>
            <Text color={metrics.queue.dlqDepth > 0 ? 'red' : 'gray'}>
              {metrics.queue.dlqDepth}
            </Text>
          </Box>
        </Box>

        {/* Observability Metrics Panel - NEW in Phase 5! */}
        <Box marginTop={1} justifyContent="center">
          <Box borderStyle="double" borderColor="magenta" paddingX={2} paddingY={0}>
            <Box flexDirection="column">
              <Text color="magenta" bold>📊 OBSERVABILITY DASHBOARD</Text>
              <Box gap={3}>
                <Box flexDirection="column">
                  <Text color="cyan" bold>Logs</Text>
                  <Text color="white">{allEvents.length} events</Text>
                </Box>
                <Box flexDirection="column">
                  <Text color="green" bold>Metrics</Text>
                  <Text color="white">{metrics.throughput.toFixed(1)} msg/s</Text>
                </Box>
                <Box flexDirection="column">
                  <Text color="yellow" bold>Queue</Text>
                  <Text color="white">{metrics.queue.depth} pending</Text>
                </Box>
                <Box flexDirection="column">
                  <Text color={metrics.queue.dlqDepth > 0 ? 'red' : 'gray'} bold>Errors</Text>
                  <Text color={metrics.queue.dlqDepth > 0 ? 'red' : 'white'}>{metrics.queue.dlqDepth} in DLQ</Text>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Prominent Event Stream - single frame, no box-in-box */}
        <Box marginTop={1} justifyContent="center">
          <Box flexDirection="column" borderStyle="double" borderColor="magenta" paddingX={2} width={70}>
            <Box justifyContent="space-between" gap={2}>
              <Text color="magenta" bold>📜 LIVE EVENT STREAM</Text>
              <Text dimColor>{allEvents.length} events</Text>
            </Box>
            <Box marginTop={1} flexDirection="column">
              {allEvents.length === 0 ? (
                <Text dimColor>Keine Events - starte einen Run! [1]</Text>
              ) : (
                <LiveEventFeed events={allEvents} maxEvents={6} compact />
              )}
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Echte Lambda-Logs mit correlationId: [Q] zurück, dann [L] Live-Logs</Text>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  }

  // ============================================
  // PHASE 6: Production Ready - Everything Together!
  // Full architecture + take-home checklist
  // ============================================
  return (
    <Box flexDirection="column">
      {renderPhaseHeader()}

      {/* Bonus Badge */}
      <Box justifyContent="center" marginBottom={1}>
        <Box borderStyle="double" borderColor="green" paddingX={2}>
          <Text color="green" bold>🏆 BONUS CHALLENGE: Production-Ready Architecture</Text>
        </Box>
      </Box>

      {renderFullArchitecture()}

      {/* Take-Home Checklist - honest: this is what's still MISSING */}
      <Box marginTop={1} justifyContent="center">
        <Box borderStyle="round" borderColor="yellow" paddingX={2}>
          <Text>
            <Text color="yellow" bold>Take-Home: </Text>
            <Text color="yellow">[ ] X-Ray  [ ] KMS  [ ] Secrets Manager  [ ] DLQ-Alarm</Text>
            <Text dimColor>  (fehlt hier bewusst!)</Text>
          </Text>
        </Box>
      </Box>

      {renderEventFeed()}
    </Box>
  );
};

export default CinematicDiagram;
