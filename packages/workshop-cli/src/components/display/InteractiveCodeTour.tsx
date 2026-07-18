/**
 * Interactive Code Tour Component
 *
 * Split-screen display: Left = Code, Right = Live Proof
 * Uses Node.js proof functions (cross-platform) instead of shell commands.
 *
 * Multi-Step Experiment Flow:
 * question → step_1 → step_2 → ... → result
 *     ↓         ↓         ↓           ↓
 *  [Enter]   [Enter]   [Enter]     [Enter]
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import Spinner from 'ink-spinner';
import { highlight } from 'cli-highlight';
import type { ProofResult, ExperimentResult, ExperimentStep } from '../../lib/tour-helpers.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';

// Re-export ExperimentResult for backwards compatibility
export type { ExperimentResult } from '../../lib/tour-helpers.js';

export interface ExperimentConfig {
  question: string;           // "Was passiert wenn..."
  hypotheses: string[];       // ["A) Lambda crasht", "B) Doppelverarbeitung", ...]
  correctAnswer: string;      // "B"
  ahamoment: string;          // Erkenntnis nach Experiment
}

/**
 * Strukturierte "Warum ist das wichtig?" Erklärung
 */
export interface WhyThisMatters {
  problem: string;      // "Ohne Port-Mapping..."
  consequence: string;  // "...kannst du nicht auf LocalStack zugreifen"
  realWorld?: string;   // "In AWS brauchst du VPC Endpoints stattdessen"
}

/**
 * Häufiger Fehler mit Erklärung
 */
export interface CommonMistake {
  wrong: string;        // "DB_HOST='localhost'"
  why: string;          // "Lambda läuft IN Docker, nicht auf deinem Host"
  fix: string;          // "DB_HOST='postgres' (Docker Service Name)"
}

export interface TourStep {
  title: string;
  file: string;
  code: string;
  highlightLines?: number[];  // 1-indexed line numbers to highlight
  explanation: string;
  proofFn?: () => Promise<ProofResult>;

  // NEU: Strukturierte Erklärungen
  whyThisMatters?: WhyThisMatters;
  commonMistake?: CommonMistake;

  // NEU: Experiment-Support
  experimentFn?: () => Promise<ExperimentResult>;
  experimentConfig?: ExperimentConfig;
}

interface Props {
  steps: TourStep[];
  onComplete: () => void;
}

type ProofStatus = 'idle' | 'running' | 'success' | 'error';

// Experiment State: question → step_0 → step_1 → ... → result
type ExperimentState =
  | { phase: 'question' }
  | { phase: 'running' }  // Loading all steps
  | { phase: 'step'; index: number }  // Showing step N
  | { phase: 'result' };  // Final summary

export const InteractiveCodeTour: React.FC<Props> = ({ steps, onComplete }) => {
  const { exit } = useApp();
  const terminalSize = useTerminalSize();
  const [stepIndex, setStepIndex] = useState(0);
  const [proofStatus, setProofStatus] = useState<ProofStatus>('idle');
  const [output, setOutput] = useState('');
  const [cliEquivalent, setCliEquivalent] = useState('');

  // Experiment State
  const [experimentState, setExperimentState] = useState<ExperimentState | null>(null);
  const [selectedHypothesis, setSelectedHypothesis] = useState<number>(0);
  const [experimentResult, setExperimentResult] = useState<ExperimentResult | null>(null);

  // NEU: Pause-Timer für Experiment-Steps (Countdown in Sekunden)
  const [pauseRemaining, setPauseRemaining] = useState<number>(0);

  const currentStep = steps[stepIndex];

  const hasExperiment = Boolean(currentStep.experimentFn && currentStep.experimentConfig);

  const runProof = useCallback(async () => {
    if (proofStatus === 'running' || !currentStep.proofFn) return;

    setProofStatus('running');
    try {
      const result = await currentStep.proofFn();
      setOutput(result.output.substring(0, 600)); // Limit output
      setCliEquivalent(result.cliEquivalent);
      setProofStatus(result.success ? 'success' : 'error');
    } catch (e) {
      setOutput(e instanceof Error ? e.message : 'Unbekannter Fehler');
      setCliEquivalent('');
      setProofStatus('error');
    }
  }, [currentStep, proofStatus]);

  const startExperiment = useCallback(() => {
    if (!hasExperiment) return;
    setExperimentState({ phase: 'question' });
    setSelectedHypothesis(0);
    setExperimentResult(null);
  }, [hasExperiment]);

  // Helper: Starte Pause-Timer für einen Step
  const startPauseForStep = useCallback((step: ExperimentStep) => {
    const pauseTime = step.minPauseSeconds ?? (step.thinkAboutIt ? 3 : 2);
    setPauseRemaining(pauseTime);
  }, []);

  const runExperiment = useCallback(async () => {
    if (!currentStep.experimentFn) return;

    setExperimentState({ phase: 'running' });
    try {
      const result = await currentStep.experimentFn();
      setExperimentResult(result);
      // Start with first step if available, otherwise go to result
      if (result.steps && result.steps.length > 0) {
        setExperimentState({ phase: 'step', index: 0 });
        // Starte Pause-Timer für ersten Step
        startPauseForStep(result.steps[0]);
      } else {
        setExperimentState({ phase: 'result' });
      }
    } catch (e) {
      setExperimentResult({
        success: false,
        observation: e instanceof Error ? e.message : 'Experiment fehlgeschlagen',
        steps: [],
        conclusion: {
          measuredValues: {},
          ahaMessage: 'Experiment konnte nicht durchgeführt werden.',
          learnedMessage: '',
        },
      });
      setExperimentState({ phase: 'result' });
    }
  }, [currentStep, startPauseForStep]);

  const nextExperimentStep = useCallback(() => {
    if (!experimentResult?.steps || !experimentState) return;
    // Blockiere wenn Pause noch läuft
    if (pauseRemaining > 0) return;

    if (experimentState.phase === 'step') {
      const nextIndex = experimentState.index + 1;
      if (nextIndex < experimentResult.steps.length) {
        setExperimentState({ phase: 'step', index: nextIndex });
        // Starte Pause-Timer für nächsten Step
        startPauseForStep(experimentResult.steps[nextIndex]);
      } else {
        setExperimentState({ phase: 'result' });
      }
    }
  }, [experimentResult, experimentState, pauseRemaining, startPauseForStep]);

  // Timer-Effect: Countdown für Pause
  useEffect(() => {
    if (pauseRemaining <= 0) return;

    const timer = setTimeout(() => {
      setPauseRemaining(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [pauseRemaining]);

  const exitExperiment = useCallback(() => {
    setExperimentState(null);
    setSelectedHypothesis(0);
    setExperimentResult(null);
  }, []);

  const goToNextStep = useCallback(() => {
    if (stepIndex < steps.length - 1) {
      setStepIndex(i => i + 1);
      setProofStatus('idle');
      setOutput('');
      setCliEquivalent('');
      setExperimentState(null);
      setExperimentResult(null);
    } else {
      onComplete();
    }
  }, [stepIndex, steps.length, onComplete]);

  useInput((input, key) => {
    // Escape: Beende Tour oder Experiment
    if (key.escape) {
      if (experimentState) {
        exitExperiment();
      } else {
        onComplete();
      }
      return;
    }

    // Experiment-Modus Handling
    if (experimentState) {
      const config = currentStep.experimentConfig;
      if (!config) return;

      if (experimentState.phase === 'question') {
        // Pfeiltasten für Hypothesen-Auswahl
        if (key.upArrow) {
          setSelectedHypothesis(h => Math.max(0, h - 1));
        } else if (key.downArrow) {
          setSelectedHypothesis(h => Math.min(config.hypotheses.length - 1, h + 1));
        } else if (key.return) {
          // Hypothese gewählt → Experiment starten
          runExperiment();
        }
      } else if (experimentState.phase === 'step' && key.return) {
        // Nächster Step oder zum Result
        nextExperimentStep();
      } else if (experimentState.phase === 'result' && key.return) {
        // Nach Auflösung: Experiment beenden
        exitExperiment();
      }
      return;
    }

    // Normal-Modus Handling
    if (input.toLowerCase() === 'e' && hasExperiment && proofStatus === 'idle') {
      startExperiment();
      return;
    }

    if (proofStatus === 'idle' && key.return && currentStep.proofFn) {
      runProof();
    } else if ((proofStatus === 'success' || proofStatus === 'error') && key.return) {
      goToNextStep();
    } else if (proofStatus === 'idle' && key.return && !currentStep.proofFn) {
      // Kein proofFn: direkt weiter
      goToNextStep();
    }
  });

  // Syntax highlight the code
  const highlightedCode = highlight(currentStep.code.trim(), { language: 'typescript' });
  const codeLines = highlightedCode.split('\n');

  // Narrow terminals: stack the panels instead of squeezing them side by side
  const stacked = terminalSize.columns < 110;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header - no border, just styled text */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          ── Tour {stepIndex + 1}/{steps.length}: {currentStep.title} ──
        </Text>
      </Box>

      {/* Explanation - full width above both boxes */}
      <Box marginBottom={1} paddingX={1} flexDirection="column">
        <Text wrap="wrap" color="white">
          <Text color="yellow" bold>Erklärung: </Text>
          {currentStep.explanation}
        </Text>

        {/* NEU: Why This Matters - wenn vorhanden */}
        {currentStep.whyThisMatters && (
          <Box marginTop={1} flexDirection="column">
            <Text color="cyan" bold>💡 Warum ist das wichtig?</Text>
            <Text>
              <Text color="red">Problem: </Text>
              <Text>{currentStep.whyThisMatters.problem}</Text>
            </Text>
            <Text>
              <Text color="green">Konsequenz: </Text>
              <Text>{currentStep.whyThisMatters.consequence}</Text>
            </Text>
            {currentStep.whyThisMatters.realWorld && (
              <Text dimColor>
                <Text color="blue">Real-World: </Text>
                {currentStep.whyThisMatters.realWorld}
              </Text>
            )}
          </Box>
        )}

        {/* NEU: Common Mistake - wenn vorhanden */}
        {currentStep.commonMistake && (
          <Box marginTop={1} flexDirection="column">
            <Text color="red" bold>⚠️ Häufiger Fehler</Text>
            <Text>
              <Text color="red">❌ </Text>
              <Text>{currentStep.commonMistake.wrong}</Text>
            </Text>
            <Text dimColor>
              <Text color="yellow">→ </Text>
              {currentStep.commonMistake.why}
            </Text>
            <Text>
              <Text color="green">✓ </Text>
              <Text>{currentStep.commonMistake.fix}</Text>
            </Text>
          </Box>
        )}
      </Box>

      <Box flexDirection={stacked ? 'column' : 'row'} minHeight={12}>
        {/* LEFT: Code Panel */}
        <Box flexDirection="column" width={stacked ? '100%' : '55%'} paddingRight={stacked ? 0 : 1}>
          <Box
            borderStyle="round"
            borderColor="gray"
            padding={1}
            flexDirection="column"
            height="100%"
          >
            <Text color="blue" bold dimColor>
              {currentStep.file}
            </Text>
            <Box marginTop={1} flexDirection="column">
              {codeLines.map((line, idx) => {
                const lineNum = idx + 1;
                const isHighlighted = currentStep.highlightLines?.includes(lineNum);
                return (
                  <Box key={`code-${idx}`}>
                    <Text
                      wrap="truncate-end"
                      backgroundColor={isHighlighted ? '#3d3d00' : undefined}
                      color={isHighlighted ? 'yellow' : undefined}
                    >
                      {isHighlighted ? '> ' : '  '}{line}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>

        {/* RIGHT: Proof/Experiment Panel */}
        <Box flexDirection="column" width={stacked ? '100%' : '45%'} marginTop={stacked ? 1 : 0}>
          {/* Experiment Available Banner */}
          {hasExperiment && !experimentState && proofStatus === 'idle' && (
            <Box
              borderStyle="double"
              borderColor="magenta"
              paddingX={2}
              paddingY={1}
              marginBottom={1}
            >
              <Text>
                <Text color="magenta" bold>🧪 EXPERIMENT</Text>
                {'  '}
                <Text dimColor>Drücke</Text> <Text color="magenta" bold>[e]</Text>
              </Text>
            </Box>
          )}

          {/* Experiment Mode UI */}
          {experimentState && currentStep.experimentConfig && (
            <Box
              borderStyle="double"
              borderColor="magenta"
              padding={1}
              flexDirection="column"
              height="100%"
              overflow="hidden"
            >
              {/* Phase: Question - Hypothese wählen */}
              {experimentState.phase === 'question' && (
                <>
                  <Text bold color="magenta">🧪 Experiment</Text>
                  <Box marginTop={1}>
                    <Text wrap="wrap">{currentStep.experimentConfig.question}</Text>
                  </Box>
                  <Box marginTop={1} flexDirection="column">
                    {currentStep.experimentConfig.hypotheses.map((hypo, idx) => (
                      <Box key={`hypo-${idx}`}>
                        <Text
                          color={selectedHypothesis === idx ? 'cyan' : undefined}
                          bold={selectedHypothesis === idx}
                        >
                          {selectedHypothesis === idx ? '> ' : '  '}{hypo}
                        </Text>
                      </Box>
                    ))}
                  </Box>
                  <Box marginTop={1}>
                    <Text dimColor>[↑↓] Wählen  [Enter] Start  [Esc] Zurück</Text>
                  </Box>
                </>
              )}

              {/* Phase: Running - Loading */}
              {experimentState.phase === 'running' && (
                <>
                  <Text bold color="magenta">🔬 Experiment läuft...</Text>
                  <Box marginTop={1}>
                    <Text color="cyan"><Spinner type="dots" /> Daten werden gesammelt...</Text>
                  </Box>
                </>
              )}

              {/* Phase: Step - Einzelner Schritt */}
              {experimentState.phase === 'step' && experimentResult?.steps && (
                <>
                  <Text bold color="magenta">
                    🔬 Schritt {experimentState.index + 1}/{experimentResult.steps.length}
                  </Text>
                  <Box marginTop={1} flexDirection="column">
                    <Text color="white" bold>
                      {experimentResult.steps[experimentState.index].title}
                    </Text>
                    <Text color="cyan" dimColor>
                      $ {experimentResult.steps[experimentState.index].command}
                    </Text>
                    <Box marginTop={1}>
                      <Text color="green">
                        {experimentResult.steps[experimentState.index].result}
                      </Text>
                    </Box>
                    {experimentResult.steps[experimentState.index].narrativeAfter && (
                      <Box marginTop={1}>
                        <Text wrap="wrap" dimColor>
                          {experimentResult.steps[experimentState.index].narrativeAfter}
                        </Text>
                      </Box>
                    )}
                    {/* NEU: "Denk nach" Frage wenn vorhanden */}
                    {experimentResult.steps[experimentState.index].thinkAboutIt && (
                      <Box marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
                        <Text wrap="wrap" color="yellow">
                          🤔 {experimentResult.steps[experimentState.index].thinkAboutIt}
                        </Text>
                      </Box>
                    )}
                  </Box>
                  <Box marginTop={1}>
                    {/* NEU: Countdown oder Weiter-Button */}
                    {pauseRemaining > 0 ? (
                      <Text dimColor>
                        Lies und verstehe... ({pauseRemaining}s)
                      </Text>
                    ) : (
                      <Text bold color="cyan">[Enter] Weiter</Text>
                    )}
                  </Box>
                </>
              )}

              {/* Phase: Result - Zusammenfassung */}
              {experimentState.phase === 'result' && experimentResult && (
                <Box flexDirection="column" overflow="hidden">
                  <Text bold color="magenta">🎯 Ergebnis</Text>

                  {/* Hypothesis check */}
                  <Box marginTop={1}>
                    <Text>Deine Antwort: {currentStep.experimentConfig.hypotheses[selectedHypothesis]}</Text>
                  </Box>
                  <Box marginTop={1}>
                    {currentStep.experimentConfig.hypotheses[selectedHypothesis]?.startsWith(currentStep.experimentConfig.correctAnswer) ? (
                      <Text color="green" bold>✓ Richtig!</Text>
                    ) : (
                      <Text color="red" bold>✗ Falsch! → {currentStep.experimentConfig.correctAnswer}</Text>
                    )}
                  </Box>

                  {/* Aha moment */}
                  <Box marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
                    <Text wrap="wrap" color="yellow">
                      💡 {currentStep.experimentConfig.ahamoment}
                    </Text>
                  </Box>

                  <Box marginTop={1}>
                    <Text bold color="cyan">[Enter] Zurück zur Tour</Text>
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {/* Proof Box (nur wenn nicht im Experiment-Modus) */}
          {!experimentState && (
            <Box
              borderStyle="single"
              borderColor={proofStatus === 'success' ? 'green' : proofStatus === 'error' ? 'red' : 'gray'}
              padding={1}
              flexDirection="column"
              height="100%"
              overflow="hidden"
            >
              <Text bold>Live-Beweis</Text>

              {cliEquivalent && (
                <Text dimColor>$ {cliEquivalent}</Text>
              )}

              {proofStatus === 'idle' && (
                <Box marginTop={1}>
                  <Text color="cyan" bold>
                    [Enter] zum Testen
                  </Text>
                </Box>
              )}

              {proofStatus === 'running' && (
                <Box marginTop={1}>
                  <Text color="cyan">
                    <Spinner type="dots" /> Ausführen...
                  </Text>
                </Box>
              )}

              {proofStatus === 'success' && (
                <Box marginTop={1} flexDirection="column" flexGrow={1} overflow="hidden">
                  <Box flexGrow={1} overflow="hidden">
                    <Text color="green">{output.split('\n').slice(0, 8).join('\n')}</Text>
                  </Box>
                  <Box>
                    <Text bold color="green">
                      [Enter] {stepIndex < steps.length - 1 ? 'Weiter' : 'Tour beenden'}
                    </Text>
                  </Box>
                </Box>
              )}

              {proofStatus === 'error' && (
                <Box marginTop={1} flexDirection="column" flexGrow={1} overflow="hidden">
                  <Box flexGrow={1} overflow="hidden">
                    <Text color="red">{output.split('\n').slice(0, 8).join('\n')}</Text>
                  </Box>
                  <Box>
                    <Text bold color="yellow">
                      [Enter] Trotzdem weiter
                    </Text>
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>[Esc] Tour beenden</Text>
      </Box>
    </Box>
  );
};
