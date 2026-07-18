/**
 * DeploymentPipeline - "Transient Action Card" für Reactive Loop
 *
 * Zeigt den Build → Zip → Deploy → Test Pipeline-Status
 * mit verschiedenen Farben für verschiedene Error-Typen
 * und klickbaren Error-Links + Smart Hints
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { join } from 'path';
import { FileLink } from './FileLink.js';
import { ProgressBar } from './ProgressBar.js';
import { getProgressiveHint as getCatalogHint } from '../../lib/error-catalog.js';
import type { ReactiveLoopState, PipelineStep, ErrorType } from '../../hooks/useReactiveLoop.js';

interface DeploymentPipelineProps {
  state: ReactiveLoopState;
  watching?: boolean; // Show "Watching for changes..." when idle
  onDismiss?: () => void;
  forceMinimized?: boolean; // Dashboard kann kompakt erzwingen
  showProgressBars?: boolean; // Show animated progress bars for steps
  errorCount?: number; // Number of times this error has occurred (for progressive hints)
  phase?: number; // Current phase (for phase-specific hints)
  breakItMode?: boolean; // Break-it challenge - test errors are expected
}

/**
 * Parse error message to extract file location
 */
interface ErrorLocation {
  file: string;
  line?: number;
  column?: number;
}

function parseErrorLocation(error: string, details: string | null, packageName: string | null): ErrorLocation | null {
  const projectRoot = join(process.cwd(), '..', '..');
  const allText = `${error}\n${details || ''}`;

  // TypeScript error: error TS2345: ... at file.ts:42:15
  // or: file.ts(42,15): error TS2345
  const tsMatch = allText.match(/([a-zA-Z0-9_\-./]+\.ts)[:(](\d+)[,:]?(\d+)?/);
  if (tsMatch) {
    const [, file, line, column] = tsMatch;
    const fullPath = file.startsWith('/') ? file :
      packageName ? join(projectRoot, 'packages', packageName, file) : file;
    return {
      file: fullPath,
      line: parseInt(line, 10),
      column: column ? parseInt(column, 10) : undefined,
    };
  }

  // Generic path pattern: packages/xyz/src/handler.ts
  const pathMatch = allText.match(/packages\/([^/]+)\/[^\s:]+\.ts/);
  if (pathMatch) {
    const fullPath = join(projectRoot, pathMatch[0]);
    return { file: fullPath };
  }

  return null;
}

/**
 * Get smart hint based on error pattern
 */
function getSmartHint(error: string, details: string | null): string | null {
  const allText = `${error}\n${details || ''}`.toLowerCase();

  // NOT_IMPLEMENTED
  if (allText.includes('not_implemented')) {
    return '💡 Ersetze "throw new Error(\'NOT_IMPLEMENTED\')" mit deiner Implementierung';
  }

  // Missing return
  if (allText.includes('return') && allText.includes('undefined')) {
    return '💡 Vergessen, einen Wert zurückzugeben?';
  }

  // Connection refused
  if (allText.includes('econnrefused') || allText.includes('connection refused')) {
    return '💡 LocalStack/Postgres nicht gestartet? → docker compose up -d';
  }

  // Type errors
  if (allText.includes('ts2345') || allText.includes('ts2322')) {
    return '💡 TypeScript Typfehler - prüfe die Funktionssignatur';
  }

  // Cannot find module
  if (allText.includes('cannot find module') || allText.includes('module not found')) {
    return '💡 Import fehlt oder Pfad falsch?';
  }

  // Property does not exist
  if (allText.includes('property') && allText.includes('does not exist')) {
    return '💡 Eigenschaft existiert nicht - Tippfehler?';
  }

  // Async/await issues
  if (allText.includes('promise') && (allText.includes('await') || allText.includes('then'))) {
    return '💡 Async/Await vergessen?';
  }

  return null;
}

/**
 * Format duration in seconds
 */
function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '';
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Get border color based on status/error type
 */
function getBorderColor(status: ReactiveLoopState['status'], errorType: ErrorType): string {
  if (status === 'success') return 'green';
  if (status === 'error') {
    switch (errorType) {
      case 'infra': return 'red';
      case 'build': return 'yellow'; // orange-ish in terminal
      case 'test': return 'yellow';
      default: return 'red';
    }
  }
  return 'cyan'; // running
}

/**
 * Get title based on status
 */
function getTitle(state: ReactiveLoopState): { icon: string; text: string; color: string } {
  const { status, lambdaName, errorType, changedFile } = state;

  if (status === 'detected') {
    return {
      icon: '👀',
      text: `Änderung erkannt: ${changedFile || 'file'}`,
      color: 'yellow',
    };
  }

  if (status === 'success') {
    return {
      icon: '✅',
      text: `${lambdaName || 'Stack'} deployed`,
      color: 'green',
    };
  }

  if (status === 'error') {
    switch (errorType) {
      case 'infra':
        return { icon: '✗', text: 'Deploy Failed', color: 'red' };
      case 'build':
        return { icon: '!', text: 'Build Failed', color: 'yellow' };
      case 'test':
        return { icon: '!', text: 'Test Failed', color: 'yellow' };
      default:
        return { icon: '✗', text: 'Error', color: 'red' };
    }
  }

  return {
    icon: '🚀',
    text: `Deploying ${lambdaName || ''}...`,
    color: 'cyan',
  };
}

/**
 * Step indicator component (classic inline version)
 */
const StepIndicatorInline: React.FC<{ step: PipelineStep }> = ({ step }) => {
  const { status, label, duration } = step;

  let icon: React.ReactNode;
  let color: string;

  switch (status) {
    case 'success':
      icon = '✔';
      color = 'green';
      break;
    case 'error':
      icon = '✗';
      color = 'red';
      break;
    case 'running':
      icon = <Spinner type="dots" />;
      color = 'cyan';
      break;
    default:
      icon = ' ';
      color = 'gray';
  }

  return (
    <Box>
      <Text color={color}>[</Text>
      <Text color={color}>{icon}</Text>
      <Text color={color}>]</Text>
      <Text color={status === 'pending' ? 'gray' : 'white'}> {label}</Text>
      {duration != null && status === 'success' && (
        <Text dimColor> ({formatDuration(duration)})</Text>
      )}
    </Box>
  );
};

/**
 * Step with progress bar (stacked view)
 */
const StepWithProgress: React.FC<{ step: PipelineStep }> = ({ step }) => {
  const { status, label, duration, progress = 0 } = step;

  // Determine icon and color
  let icon: string;
  let color: string;

  switch (status) {
    case 'success':
      icon = '✓';
      color = 'green';
      break;
    case 'error':
      icon = '✗';
      color = 'red';
      break;
    case 'running':
      icon = '⠋';
      color = 'cyan';
      break;
    default:
      icon = '○';
      color = 'gray';
  }

  // Calculate progress percentage
  const percent = status === 'success' ? 100 :
    status === 'error' ? progress :
    status === 'running' ? progress : 0;

  return (
    <Box>
      <Text color={color}>{label.padEnd(7)}</Text>
      <ProgressBar
        percent={percent}
        width={16}
        animated={status === 'running'}
        color={color}
        showPercent={false}
      />
      <Text color={color}> {icon}</Text>
      {duration != null && status === 'success' && (
        <Text dimColor> {formatDuration(duration)}</Text>
      )}
    </Box>
  );
};

/**
 * Minimized view (single line after success)
 */
const MinimizedView: React.FC<{ state: ReactiveLoopState }> = ({ state }) => {
  const { lambdaName, totalDuration } = state;

  return (
    <Box>
      <Text dimColor>── </Text>
      <Text color="green">✅ {lambdaName} OK</Text>
      {totalDuration && (
        <Text dimColor> ({formatDuration(totalDuration)})</Text>
      )}
      <Text dimColor> ──</Text>
    </Box>
  );
};

/**
 * Expanded view (running, success before minimize, error)
 */
const ExpandedView: React.FC<{
  state: ReactiveLoopState;
  showProgressBars?: boolean;
  errorCount?: number;
  phase?: number;
  breakItMode?: boolean;
}> = ({ state, showProgressBars = false, errorCount = 1, phase, breakItMode = false }) => {
  const { status, steps, error, errorDetails, totalDuration, errorType, packageName } = state;

  // In Break-it mode, test errors are expected and shown as success
  const isExpectedError = breakItMode && status === 'error' && errorType === 'test';

  const title = isExpectedError
    ? { icon: '✓', text: 'Test Failed (expected!)', color: 'green' }
    : getTitle(state);
  const borderColor = isExpectedError ? 'green' : getBorderColor(status, errorType);

  // Parse error location for clickable links
  const errorLocation = status === 'error' && error && !isExpectedError
    ? parseErrorLocation(error, errorDetails, packageName)
    : null;

  // Get progressive hint based on error pattern and count
  const progressiveHint = status === 'error' && error && !isExpectedError
    ? getCatalogHint(error, errorDetails, errorCount, phase)
    : null;

  // Fallback to simple smart hint if no catalog match
  const smartHint = progressiveHint?.hint || (status === 'error' && error && !isExpectedError
    ? getSmartHint(error, errorDetails)
    : null);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
    >
      {/* Header */}
      <Box justifyContent="space-between">
        <Box>
          {status === 'running' ? (
            <Text color={title.color} bold>
              <Spinner type="dots" /> {title.text}
            </Text>
          ) : (
            <Text color={title.color} bold>
              {title.icon} {title.text}
            </Text>
          )}
          {status === 'success' && totalDuration && (
            <Text dimColor> - Deployed & Validated in {formatDuration(totalDuration)}</Text>
          )}
          {isExpectedError && (
            <Text dimColor> - Schau jetzt in die Logs!</Text>
          )}
        </Box>
        {/* Error count indicator */}
        {status === 'error' && errorCount > 1 && !isExpectedError && (
          <Text color="gray" dimColor>
            ({errorCount}x)
          </Text>
        )}
      </Box>

      {/* Pipeline steps (only show if running or error, but not expected error) */}
      {(status === 'running' || (status === 'error' && !isExpectedError)) && showProgressBars && (
        <Box flexDirection="column" marginTop={1}>
          {steps.map((step) => (
            <StepWithProgress key={step.id} step={step} />
          ))}
        </Box>
      )}

      {/* Inline steps (when progress bars disabled) */}
      {(status === 'running' || (status === 'error' && !isExpectedError)) && !showProgressBars && (
        <Box marginTop={status === 'error' ? 0 : 0} gap={1}>
          {steps.map((step, i) => (
            <React.Fragment key={step.id}>
              <StepIndicatorInline step={step} />
              {i < steps.length - 1 && (
                <Text dimColor>→</Text>
              )}
            </React.Fragment>
          ))}
        </Box>
      )}

      {/* Break-it mode: Show hint to check logs */}
      {isExpectedError && (
        <Box marginTop={1}>
          <Text color="cyan">💡 Schau in die Logs und finde das Secret!</Text>
        </Box>
      )}

      {/* Error message with clickable location (not in break-it mode for expected errors) */}
      {status === 'error' && error && !isExpectedError && (
        <Box flexDirection="column" marginTop={1}>
          {/* Clickable error location */}
          {errorLocation ? (
            <Box>
              <Text color={errorType === 'infra' ? 'red' : 'yellow'}>❌ Error in </Text>
              <FileLink
                path={errorLocation.file}
                line={errorLocation.line}
                column={errorLocation.column}
                color={errorType === 'infra' ? 'red' : 'yellow'}
              />
            </Box>
          ) : (
            <Text color={errorType === 'infra' ? 'red' : 'yellow'}>
              {error}
            </Text>
          )}

          {/* Error details (truncated) */}
          {errorDetails && !errorLocation && (
            <Text dimColor wrap="wrap">
              {errorDetails.split('\n').slice(0, 3).join('\n')}
            </Text>
          )}

          {/* Smart hint based on error pattern */}
          {smartHint && (
            <Text color="cyan">{smartHint}</Text>
          )}

          {/* Infrastructure hint */}
          {errorType === 'infra' && !smartHint && (
            <Text dimColor>
              → docker compose -f local/docker-compose.yml up -d
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
};

/**
 * Idle/Watching view
 */
const WatchingView: React.FC = () => (
  <Box>
    <Text color="gray">👁 </Text>
    <Text dimColor>Watching for changes...</Text>
  </Box>
);

/**
 * Detected view (brief flash before deploy starts)
 */
const DetectedView: React.FC<{ state: ReactiveLoopState }> = ({ state }) => {
  const title = getTitle(state);
  return (
    <Box
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
    >
      <Text color={title.color} bold>
        {title.icon} {title.text}
      </Text>
    </Box>
  );
};

/**
 * Main DeploymentPipeline component
 */
export const DeploymentPipeline: React.FC<DeploymentPipelineProps> = ({
  state,
  watching = false,
  forceMinimized = false,
  showProgressBars = true, // Enable by default for the new animated experience
  errorCount = 1,
  phase,
  breakItMode = false,
}) => {
  const { status, minimized } = state;

  // Don't show anything when idle - Sidebar shows "Watching" status
  if (status === 'idle') {
    return null;
  }

  // Show "Änderung erkannt" briefly
  if (status === 'detected') {
    return <DetectedView state={state} />;
  }

  // Minimized view after success (or forced by parent)
  const shouldMinimize = minimized || forceMinimized;
  if (shouldMinimize && status === 'success') {
    return <MinimizedView state={state} />;
  }

  // Expanded view
  return (
    <ExpandedView
      state={state}
      showProgressBars={showProgressBars}
      errorCount={errorCount}
      phase={phase}
      breakItMode={breakItMode}
    />
  );
};
