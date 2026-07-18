/**
 * CDK Guide Screen
 *
 * Provides a guided, real-time experience for editing CDK code.
 * Features:
 * - Watches cdk/lib/workshop-stack.ts for changes
 * - Validates on every save with precise feedback
 * - Shows exact line numbers to edit
 * - Offers auto-fix for recoverable errors
 * - Scrollable content for small terminals
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { useFileWatcher } from '../hooks/useFileWatcher.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import {
  validateCdkForPhase,
  getCdkEditInstructions,
  applyCdkChanges,
  getCdkStackPath,
  PHASE_LAMBDAS,
  type CdkError,
} from '../lib/cdk-operations.js';
import { FileLink } from '../components/display/FileLink.js';

interface CdkGuideScreenProps {
  phase: number;
  onComplete: () => void;
  onBack: () => void;
}

type ValidationStatus = 'idle' | 'validating' | 'success' | 'error';

export const CdkGuideScreen: React.FC<CdkGuideScreenProps> = ({
  phase,
  onComplete,
  onBack,
}) => {
  const [errors, setErrors] = useState<CdkError[]>([]);
  const [status, setStatus] = useState<ValidationStatus>('idle');
  const [instructions, setInstructions] = useState<{
    startLine: number;
    endLine: number;
    instruction: string;
    linesToUncomment: number[];
  } | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [lastValidation, setLastValidation] = useState<Date | null>(null);
  const [validationCount, setValidationCount] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  const config = PHASE_LAMBDAS[phase];
  const cdkPath = getCdkStackPath();

  // Reactive terminal size: useStdout alone never triggers a re-render
  // on resize, so the guide would stay stuck at its opening size
  const terminalSize = useTerminalSize();
  // Reserve space for header (~4), file link (1), footer (2), padding (2)
  const maxVisibleLines = Math.max(5, terminalSize.rows - 9);

  // Validate CDK on mount and file changes
  // Validates ALL phases up to current phase (cumulative)
  const runValidation = useCallback(async () => {
    setStatus('validating');
    setScrollOffset(0); // Reset scroll on re-validation
    try {
      // Validate all phases from 1 to current (cumulative check)
      const allErrors: Awaited<ReturnType<typeof validateCdkForPhase>> = [];
      for (let p = 1; p <= phase; p++) {
        const phaseErrors = await validateCdkForPhase(p);
        allErrors.push(...phaseErrors);
      }

      const editInstructions = await getCdkEditInstructions(phase);

      setErrors(allErrors);
      setInstructions(editInstructions);
      setLastValidation(new Date());
      setValidationCount(prev => prev + 1);

      if (allErrors.length === 0 && editInstructions.linesToUncomment.length === 0) {
        setStatus('success');
      } else {
        setStatus('error');
      }
    } catch (error) {
      setStatus('error');
      setErrors([{
        type: 'SYNTAX_ERROR',
        phase,
        message: `Validierung fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannt'}`,
        hint: 'Stelle sicher, dass die Datei existiert und korrekte Syntax hat.',
        canAutoFix: false,
        severity: 'error',
      }]);
    }
  }, [phase]);

  // File watcher for real-time validation
  const { watching, changeCount } = useFileWatcher({
    paths: ['cdk/lib/workshop-stack.ts'],
    enabled: true,
    debounceMs: 500, // Quick feedback
    onFileChange: () => {
      runValidation();
    },
  });

  // Initial validation
  useEffect(() => {
    runValidation();
  }, [runValidation]);

  // Handle auto-fix
  const handleAutoFix = async () => {
    setIsApplying(true);
    try {
      const result = await applyCdkChanges(phase);
      if (result.success) {
        // Re-validate after fix
        await runValidation();
      }
    } catch (error) {
      // Error handling
    } finally {
      setIsApplying(false);
    }
  };

  // Derived values
  const hasFixableErrors = errors.some(e => e.canAutoFix);
  const criticalErrors = errors.filter(e => e.severity === 'error');
  const warnings = errors.filter(e => e.severity === 'warning');

  // Build content lines for scrolling
  const contentLines: React.ReactNode[] = [];

  // Validating content
  if (status === 'validating') {
    contentLines.push(
      <Box key="validating" borderStyle="single" borderColor="blue" paddingX={2}>
        <Text color="blue">⏳ Validiere CDK Stack...</Text>
      </Box>
    );
  }

  // Success content
  if (status === 'success') {
    contentLines.push(
      <Box key="success" borderStyle="double" borderColor="green" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="green">✓ CDK Stack ist bereit!</Text>
        <Text color="white">{config?.name} ist korrekt konfiguriert.</Text>
        <Text> </Text>
        <Text dimColor>Führe jetzt aus: <Text color="cyan" bold>cd cdk && npx cdklocal deploy</Text></Text>
      </Box>
    );
  }

  // Error content
  if (status === 'error' && criticalErrors.length > 0) {
    contentLines.push(
      <Box key="error-header" marginBottom={1}>
        <Text bold color="red">✗ {criticalErrors.length} Fehler gefunden</Text>
      </Box>
    );

    criticalErrors.forEach((error, idx) => {
      contentLines.push(
        <Box key={`error-${idx}`} flexDirection="column" marginBottom={1}>
          <Text>
            <Text color="red">•</Text> <Text color="white" bold>{error.message}</Text>
            {error.lineNumber && <Text dimColor> (Zeile {error.lineNumber})</Text>}
          </Text>
          <Text color="yellow">  → {error.hint}</Text>
          {error.canAutoFix && (
            <Text color="green" dimColor>  [a] kann automatisch behoben werden</Text>
          )}
        </Box>
      );
    });
  }

  // Warnings
  if (warnings.length > 0) {
    contentLines.push(
      <Box key="warnings" flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">⚠ {warnings.length} Warnung(en)</Text>
        {warnings.map((warning, idx) => (
          <Text key={idx} color="yellow">• {warning.message}</Text>
        ))}
      </Box>
    );
  }

  // Instructions
  if (status === 'error' && instructions && instructions.linesToUncomment.length > 0 && config) {
    contentLines.push(
      <Box key="instructions" flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
        <Text bold color="cyan">📝 Anleitung</Text>
        <Text> </Text>
        <Text>1. Öffne <Text color="cyan" bold>cdk/lib/workshop-stack.ts</Text></Text>
        <Text>2. Suche nach <Text color="yellow" bold>// ⚠️ TODO PHASE {phase}</Text></Text>
        <Text>3. {instructions.instruction}</Text>
        <Text>4. <Text color="red" bold>WICHTIG:</Text> Lass die TODO/HINT Kommentare stehen!</Text>
        <Text>5. Speichere - Validierung läuft automatisch!</Text>
        <Text> </Text>
        <Text bold dimColor>💡 Was du einkommentieren musst:</Text>
        <Text dimColor>• Lambda-Definition: <Text color="white">new nodejs.NodejsFunction(...)</Text></Text>
        {config.hasEventSource && (
          <Text dimColor>• Event Source: <Text color="white">.addEventSource(new SqsEventSource(...))</Text></Text>
        )}
        <Text dimColor>• Grants: <Text color="white">{config.requiredGrants.length} Permission-Aufrufe</Text></Text>
      </Box>
    );
  }

  const totalLines = contentLines.length;
  const canScroll = totalLines > maxVisibleLines;
  const maxOffset = Math.max(0, totalLines - maxVisibleLines);

  // Get visible content slice
  const visibleLines = contentLines.slice(scrollOffset, scrollOffset + maxVisibleLines);

  // Input handling
  useInput((input, key) => {
    const lower = input.toLowerCase();

    // Scroll handling
    if (canScroll) {
      if (key.upArrow || lower === 'k') {
        setScrollOffset(prev => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow || lower === 'j') {
        setScrollOffset(prev => Math.min(maxOffset, prev + 1));
        return;
      }
      if (key.pageUp) {
        setScrollOffset(prev => Math.max(0, prev - maxVisibleLines));
        return;
      }
      if (key.pageDown) {
        setScrollOffset(prev => Math.min(maxOffset, prev + maxVisibleLines));
        return;
      }
    }

    // [a] Auto-fix (only if has fixable errors)
    if (lower === 'a' && !isApplying && errors.some(e => e.canAutoFix)) {
      handleAutoFix();
      return;
    }

    // [r] Re-validate
    if (lower === 'r' && status !== 'validating') {
      runValidation();
      return;
    }

    // [Enter] Continue (only if success)
    if (key.return && status === 'success') {
      onComplete();
      return;
    }

    // [Esc] / [q] Back
    if (key.escape || lower === 'q') {
      onBack();
      return;
    }
  });

  if (!config) {
    return (
      <Box padding={2}>
        <Text color="red">Keine CDK-Konfiguration für Phase {phase}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1} height="100%">
      {/* Header */}
      <Box
        borderStyle="round"
        borderColor={status === 'success' ? 'green' : status === 'error' ? 'yellow' : 'cyan'}
        paddingX={2}
        paddingY={0}
        marginBottom={1}
        flexShrink={0}
      >
        <Box flexDirection="row" gap={2}>
          <Text bold color={status === 'success' ? 'green' : 'cyan'}>
            {status === 'success' ? '✓' : '🔧'} CDK Guide - Phase {phase}
          </Text>
          <Text dimColor>({config.name})</Text>
          {watching && <Text color="green" dimColor>● Watching</Text>}
          {lastValidation && (
            <Text dimColor>
              | {lastValidation.toLocaleTimeString('de-DE')}
              {validationCount > 1 && ` (${validationCount}x)`}
            </Text>
          )}
        </Box>
      </Box>

      {/* File Link */}
      <Box marginBottom={1} flexShrink={0}>
        <Text dimColor>Datei: </Text>
        <FileLink path={cdkPath} label="workshop-stack.ts" color="cyan" />
        {instructions && instructions.linesToUncomment.length > 0 && (
          <Text dimColor>
             → Zeilen {instructions.linesToUncomment[0]}-
            {instructions.linesToUncomment[instructions.linesToUncomment.length - 1]}
          </Text>
        )}
      </Box>

      {/* Scroll indicator - top */}
      {canScroll && scrollOffset > 0 && (
        <Box flexShrink={0}>
          <Text dimColor>↑ Mehr oben ({scrollOffset} Zeilen)</Text>
        </Box>
      )}

      {/* Scrollable content area */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {visibleLines}
      </Box>

      {/* Scroll indicator - bottom */}
      {canScroll && scrollOffset < maxOffset && (
        <Box flexShrink={0}>
          <Text dimColor>↓ Mehr unten ({maxOffset - scrollOffset} Zeilen)</Text>
        </Box>
      )}

      {/* Footer Actions */}
      <Box
        borderStyle="single"
        borderTop
        borderLeft={false}
        borderRight={false}
        borderBottom={false}
        borderColor="gray"
        paddingTop={1}
        gap={3}
        flexShrink={0}
      >
        {status === 'success' ? (
          <>
            <Text>
              <Text color="green" bold>[Enter]</Text>
              <Text> Weiter zur Phase</Text>
            </Text>
            <Text>
              <Text color="gray" bold>[r]</Text>
              <Text dimColor> Erneut prüfen</Text>
            </Text>
          </>
        ) : (
          <>
            {hasFixableErrors && (
              <Text>
                <Text color="green" bold>[a]</Text>
                <Text> {isApplying ? 'Anwenden...' : 'Auto-Fix'}</Text>
              </Text>
            )}
            <Text>
              <Text color="cyan" bold>[r]</Text>
              <Text dimColor> Erneut prüfen</Text>
            </Text>
            {canScroll && (
              <Text>
                <Text color="gray" bold>[↑↓]</Text>
                <Text dimColor> Scrollen</Text>
              </Text>
            )}
            <Text>
              <Text color="gray" bold>[ESC]</Text>
              <Text dimColor> Zurück</Text>
            </Text>
          </>
        )}
      </Box>
    </Box>
  );
};
