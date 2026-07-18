import React, { useState, useEffect, useMemo } from 'react';
import path from 'path';
import { Box, Text, useInput } from 'ink';
import { SecretCodeInput } from '../components/input/SecretCodeInput.js';
import { PhaseHeader } from '../components/display/PhaseHeader.js';
import { LoadingSpinner } from '../components/animations/LoadingSpinner.js';
import { SolutionPreviewScreen } from './SolutionPreviewScreen.js';
import { DashboardScreen } from './DashboardScreen.js';
import { CdkGuideScreen } from './CdkGuideScreen.js';
import { ProgressiveHintViewer } from '../components/display/ProgressiveHintViewer.js';
import { DeploymentPipeline } from '../components/display/DeploymentPipeline.js';
import { InteractiveCodeTour } from '../components/display/InteractiveCodeTour.js';
import { usePhaseValidation } from '../hooks/usePhaseValidation.js';
import { useReactiveLoop } from '../hooks/useReactiveLoop.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { getTutorial } from '../lib/tutorials/index.js';
import { workshopConfig } from '../core/config/workshop.config.js';
import { hasSolution, hasBackup, restoreFromBackup, needsCdkChanges, createBreakItBackup, restoreBreakItBackup } from '../lib/file-operations.js';
import { applyCdkChanges, getCdkStatus } from '../lib/cdk-operations.js';
import { FileLink } from '../components/display/FileLink.js';
import { PHASE_CONFIG } from '../shared/constants.js';
import { StateManager, type PhaseTime } from '../core/state/workshop-state.js';
import { TimeMachine } from '../lib/time-machine.js';
import { TimeMachineDialog } from '../components/display/TimeMachineDialog.js';
import { generateBreakItNonce, armBreakItNonce } from '../lib/break-it.js';
import { phase1TourSteps } from '../lib/tutorials/phase1-tour-steps.js';
import { phase2TourSteps } from '../lib/tutorials/phase2-tour-steps.js';
import { phase3TourSteps } from '../lib/tutorials/phase3-tour-steps.js';
import { phase4TourSteps } from '../lib/tutorials/phase4-tour-steps.js';
import { phase5TourSteps } from '../lib/tutorials/phase5-tour-steps.js';
import type { TourStep } from '../components/display/InteractiveCodeTour.js';

// Map phase number to tour steps
const phaseTourSteps: Record<number, TourStep[]> = {
  1: phase1TourSteps,
  2: phase2TourSteps,
  3: phase3TourSteps,
  4: phase4TourSteps,
  5: phase5TourSteps,
};

interface PhaseScreenProps {
  phase: number;
  onNextPhase: () => void;
  onTutorial?: () => void;
  onExit: () => void;
  markPhaseComplete: (phase: number) => Promise<void>;
  onHintsActiveChange?: (active: boolean) => void;
  onModalStateChange?: (isOpen: boolean) => void;
  onWatcherActivate?: () => void;
  disableInput?: boolean; // Disable all input handling (e.g., when LogViewer is open)
}

type ScreenState = 'BRIEFING' | 'VALIDATING' | 'MENU' | 'SOLUTION' | 'HINTS' | 'DASHBOARD' | 'TIME_MACHINE' | 'CODE_TOUR' | 'SECRET_INPUT' | 'RESTORING' | 'GUIDE_OFFER' | 'CDK_MISSING' | 'CDK_GUIDE';

// Break-it Challenge: Trainer-Master-Code (Fallback "wegen der Zeit").
// Der eigentliche Freischalt-Code ist eine Session-Nonce (siehe lib/break-it),
// die nur in den Lambda-Logs auftaucht.
const PHASE1_MASTER_CODE = Buffer.from('U0VSVkVSTEVTUy1OSU5KQS0yMDI2', 'base64').toString();

// Minimum terminal height for phase screens
const MIN_HEIGHT = 20;

// Singleton state manager
const stateManager = new StateManager();

// Singleton time machine for phase snapshots
const timeMachine = new TimeMachine();

export const PhaseScreen: React.FC<PhaseScreenProps> = ({
  phase,
  onNextPhase,
  onTutorial,
  onExit,
  markPhaseComplete,
  onHintsActiveChange,
  onModalStateChange,
  onWatcherActivate,
  disableInput = false,
}) => {
  const { validating, result, runValidation, clearResult } = usePhaseValidation();
  const terminalSize = useTerminalSize();

  const [screenState, setScreenState] = useState<ScreenState>('BRIEFING');
  const [solutionExists, setSolutionExists] = useState(false);
  const [allHintsSeen, setAllHintsSeen] = useState(false);
  const [initialHintIndex, setInitialHintIndex] = useState(0);
  const [backupExists, setBackupExists] = useState(false);
  const [checkpointExists, setCheckpointExists] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [tourCompleted, setTourCompleted] = useState(false);
  const [showDashboardIntro, setShowDashboardIntro] = useState(false); // Show intro before dashboard
  const [cdkStatus, setCdkStatus] = useState<{ needed: boolean; lambdaName?: string; reason?: string }>({ needed: false });
  const [isApplyingCdk, setIsApplyingCdk] = useState(false);
  const [phaseTimes, setPhaseTimes] = useState<Record<number, PhaseTime>>({});
  const [inBreakItChallenge, setInBreakItChallenge] = useState(false); // Track if we're in Break-it challenge
  const [breakItNonce, setBreakItNonce] = useState<string | null>(null); // Session-Nonce (steht nur in den Logs)

  // Nonce nach CLI-Neustart wiederherstellen und wieder in die Prozess-Env
  // legen, damit weitere Deploys sie als RELEASE_ID mitnehmen
  useEffect(() => {
    if (phase !== 1) return;
    stateManager.loadState()
      .then(state => {
        if (state.breakItNonce) {
          setBreakItNonce(state.breakItNonce);
          armBreakItNonce(state.breakItNonce);
        }
      })
      .catch(() => {});
  }, [phase]);

  // Phase 1 Secret Input state (no longer need local state - SecretCodeInput handles it)

  const phaseInfo = workshopConfig.phases.find(p => p.id === phase);
  const tutorial = getTutorial(phase);

  // Memoize watchPaths by phase ID to prevent useReactiveLoop effect from re-running on every render
  // This is critical for file watcher stability - the watcher must not be recreated
  const watchPaths = useMemo(() => {
    const info = workshopConfig.phases.find(p => p.id === phase);
    return info?.watchPaths || [];
  }, [phase]);

  // Reactive Loop - Auto Build → Deploy → Test on file changes
  // IMPORTANT: Disable during TIME_MACHINE/CODE_TOUR to prevent race condition with file operations
  const reactiveLoop = useReactiveLoop({
    watchPaths,
    phase,
    enabled: phase > 0 && screenState !== 'SOLUTION' && screenState !== 'HINTS' && screenState !== 'TIME_MACHINE' && screenState !== 'CODE_TOUR',
  });

  const isTooSmall = terminalSize.rows < MIN_HEIGHT;
  const hasHints = tutorial?.hints && tutorial.hints.length > 0;

  // Load solution existence, hint state, backup status, CDK status, and create checkpoint
  useEffect(() => {
    const loadState = async () => {
      const [solutionCheck, hintsSeenCheck, hintProgress, backupCheck, checkpointCheck, cdkCheck, allPhaseTimes] = await Promise.all([
        hasSolution(phase).catch(() => false),
        stateManager.hasSeenAllHints(phase).catch(() => false),
        stateManager.getHintProgress(phase).catch(() => 0),
        hasBackup(phase).catch(() => false),
        timeMachine.hasCheckpoint(phase).catch(() => false),
        needsCdkChanges(phase).catch(() => ({ needed: false })),
        stateManager.getAllPhaseTimes().catch(() => ({})),
      ]);

      setSolutionExists(solutionCheck);
      setAllHintsSeen(hintsSeenCheck);
      setInitialHintIndex(hintProgress);
      setBackupExists(backupCheck);
      setCheckpointExists(checkpointCheck);
      setCdkStatus(cdkCheck);
      setPhaseTimes(allPhaseTimes);

      // Show CDK_MISSING screen if Lambda is not in CDK for phases 2-4
      if (cdkCheck.needed && [2, 3, 4].includes(phase)) {
        setScreenState('CDK_MISSING');
      }

      // Create checkpoint if it doesn't exist (Fire & Forget)
      if (!checkpointCheck && phase > 0) {
        timeMachine.ensureCheckpoint(phase)
          .then(created => {
            if (created) setCheckpointExists(true);
          })
          .catch(() => {}); // Silent failure
      }

      // Start phase timer if not already started (for phases 1+)
      if (phase > 0 && !(allPhaseTimes as Record<number, PhaseTime>)[phase]) {
        stateManager.startPhaseTimer(phase)
          .then(() => stateManager.getAllPhaseTimes())
          .then(times => setPhaseTimes(times))
          .catch(() => {}); // Silent failure
      }
    };

    loadState();
  }, [phase]);

  // Check if this phase has a guide available
  const hasTourSteps = phaseTourSteps[phase]?.length > 0;

  // Offer Guide on first visit to any phase with tour steps
  useEffect(() => {
    if (hasTourSteps && !tourCompleted && screenState === 'BRIEFING') {
      const checkTourStatus = async () => {
        try {
          const state = await stateManager.loadState();
          const isTourDone = state.tourCompleted?.[phase] ?? false;
          setTourCompleted(isTourDone);

          // Show guide offer if not completed yet
          if (!isTourDone) {
            setScreenState('GUIDE_OFFER');
          }
        } catch {
          // Ignore errors
        }
      };
      checkTourStatus();
    }
  }, [phase, hasTourSteps]);

  // Notify parent when hints screen is active (to disable global hotkeys)
  useEffect(() => {
    onHintsActiveChange?.(screenState === 'HINTS');
  }, [screenState, onHintsActiveChange]);

  // Notify parent when modal (secret input) is open (to disable global hotkeys)
  useEffect(() => {
    onModalStateChange?.(screenState === 'SECRET_INPUT' || screenState === 'RESTORING');
  }, [screenState, onModalStateChange]);

  // Handle RESTORING state: restore backup and auto-proceed
  useEffect(() => {
    if (screenState !== 'RESTORING' || phase !== 1) return;

    const restore = async () => {
      try {
        await restoreBreakItBackup(phase);
      } catch {
        // Ignore errors - user can fix manually if needed
      }
      // Wait a moment so user can read the message
      setTimeout(() => {
        setScreenState('BRIEFING');
        onNextPhase();
      }, 2000);
    };
    restore();
  }, [screenState, phase, onNextPhase]);

  // Helper: Validierung starten
  const handleValidation = async () => {
    // Activate watcher (shows "Watching" in sidebar with spinner)
    onWatcherActivate?.();
    setScreenState('VALIDATING');
    const validationResult = await runValidation(phase);

    // After successful validation (Phase >= 2): Show dashboard intro before quiz
    if (validationResult.passed && phase >= 2) {
      setShowDashboardIntro(true);
    } else {
      setScreenState('MENU');
    }
  };

  // Helper: Restore from backup
  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      await restoreFromBackup(phase);
      setBackupExists(false);
      // After restore, re-check state
      const newBackupCheck = await hasBackup(phase).catch(() => false);
      setBackupExists(newBackupCheck);
    } catch {
      // Backup might not exist or restore failed
    } finally {
      setIsRestoring(false);
    }
  };

  // Hotkeys - MUST be before any early returns (React hooks rules)
  useInput((input, key) => {
    // Skip all input when disabled (e.g., LogViewer is open)
    if (disableInput) return;

    const lowerInput = input.toLowerCase();

    // DASHBOARD_INTRO: [Enter] = open dashboard, [Esc] = skip to menu
    if (showDashboardIntro) {
      if (key.return) {
        setShowDashboardIntro(false);
        setScreenState('DASHBOARD');
        return;
      }
      if (key.escape) {
        setShowDashboardIntro(false);
        setScreenState('MENU');
        return;
      }
      return; // Ignore other keys
    }

    // SECRET_INPUT: SecretCodeInput handles all input including Escape
    if (screenState === 'SECRET_INPUT') {
      return;
    }

    // GUIDE_OFFER: [j] = Ja (start tour), [n] = Nein (skip)
    if (screenState === 'GUIDE_OFFER') {
      if (lowerInput === 'j' || key.return) {
        setScreenState('CODE_TOUR');
        return;
      }
      if (lowerInput === 'n' || key.escape) {
        setTourCompleted(true); // Mark as "seen" so we don't ask again
        setScreenState('BRIEFING');
        // Persist decision
        stateManager.updateState(state => ({
          ...state,
          tourCompleted: { ...state.tourCompleted, [phase]: true },
        })).catch(() => {});
        return;
      }
      return; // Ignore other keys in GUIDE_OFFER
    }

    // CDK_MISSING: [g] = CDK Guide, [a] = Auto-apply, [s] = Skip
    if (screenState === 'CDK_MISSING') {
      if (lowerInput === 'g' || key.return) {
        // Start CDK Guide (guided editing with live validation)
        setScreenState('CDK_GUIDE');
        return;
      }
      if (lowerInput === 'a' && !isApplyingCdk) {
        // Auto-apply CDK changes
        setIsApplyingCdk(true);
        applyCdkChanges(phase)
          .then(result => {
            if (result.success) {
              setCdkStatus({ needed: false });
              setScreenState('BRIEFING');
            }
          })
          .catch(() => {})
          .finally(() => setIsApplyingCdk(false));
        return;
      }
      if (lowerInput === 's' || key.escape) {
        // Skip - user knows what they're doing
        setScreenState('BRIEFING');
        return;
      }
      return; // Ignore other keys in CDK_MISSING
    }

    // CDK_GUIDE: Handled by CdkGuideScreen component
    if (screenState === 'CDK_GUIDE') {
      return; // CdkGuideScreen handles its own input
    }

    // These hotkeys work in BRIEFING and MENU states
    if (screenState === 'BRIEFING' || screenState === 'MENU') {
      // [v] for validation
      if (lowerInput === 'v') {
        handleValidation();
        return;
      }
      // [h] for hints
      if (lowerInput === 'h' && hasHints) {
        setScreenState('HINTS');
        return;
      }
      // [l] for solution (only if solution exists AND hints seen)
      if (lowerInput === 'l' && solutionExists && allHintsSeen) {
        setScreenState('SOLUTION');
        return;
      }
      // [r] for restore/reset
      if (lowerInput === 'r' && !isRestoring) {
        if (backupExists) {
          // Solution backup exists - restore solution
          handleRestore();
        } else if (checkpointExists) {
          // Phase checkpoint exists - show Time Machine dialog
          setScreenState('TIME_MACHINE');
        }
        return;
      }
      // [t] for tutorial
      if (lowerInput === 't' && onTutorial) {
        onTutorial();
        return;
      }
      // [g] for guided code tour (any phase with tour steps)
      if (lowerInput === 'g' && hasTourSteps) {
        setScreenState('CODE_TOUR');
        return;
      }
    }

    // Remaining hotkeys only work in MENU state
    if (screenState !== 'MENU') return;

    // Phase 1: Allow returning to Break-it challenge with [b] if already started
    if (phase === 1 && inBreakItChallenge && lowerInput === 'b') {
      setScreenState('SECRET_INPUT');
      return;
    }

    if (result?.passed) {
      if (key.return || lowerInput === 'w') {
        // Phase 1: Show secret input challenge before proceeding
        if (phase === 1) {
          // Session-Nonce würfeln (falls noch keine existiert) und in die
          // Prozess-Env legen - der nächste Deploy schreibt sie als
          // RELEASE_ID in die Lambda, das Fehler-Log verrät sie
          let nonce = breakItNonce;
          if (!nonce) {
            nonce = generateBreakItNonce();
            setBreakItNonce(nonce);
            stateManager.updateState(state => ({ ...state, breakItNonce: nonce as string })).catch(() => {});
          }
          armBreakItNonce(nonce);

          // Create backup before user breaks the code
          setInBreakItChallenge(true);
          createBreakItBackup(phase).then(() => {
            setScreenState('SECRET_INPUT');
          }).catch(() => {
            // Continue even if backup fails
            setScreenState('SECRET_INPUT');
          });
        } else {
          onNextPhase();
        }
      }
    }
  });

  if (!phaseInfo) return <Text color="red">Phase {phase} nicht gefunden</Text>;

  // Terminal too small warning
  if (isTooSmall) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="yellow" padding={1} flexDirection="column">
          <Text bold color="yellow">⚠️  Terminal zu klein</Text>
          <Box marginY={1} flexDirection="column">
            <Text>Aktuell: <Text bold color="red">{terminalSize.rows}</Text> Zeilen</Text>
            <Text>Minimum: <Text bold color="green">{MIN_HEIGHT}</Text> Zeilen</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // 1. SOLUTION SCREEN
  if (screenState === 'SOLUTION') {
    return (
      <SolutionPreviewScreen
        phase={phase}
        onBack={() => setScreenState('MENU')}
        onSuccess={async () => {
          await markPhaseComplete(phase);
          onNextPhase();
        }}
      />
    );
  }

  // 2. DASHBOARD INTRO (after successful validation, before quiz)
  if (showDashboardIntro) {
    return (
      <Box flexDirection="column" padding={2}>
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="green"
          padding={2}
        >
          <Text bold color="green">✓ Validierung erfolgreich!</Text>

          <Box marginY={1} flexDirection="column">
            <Text>Wir schauen uns das jetzt mal live an.</Text>
            <Text dimColor>Das Dashboard zeigt dir die Infrastruktur und ermöglicht Live-Tests.</Text>
          </Box>

          <Box marginTop={2} gap={3}>
            <Text>
              <Text color="green" bold>[Enter]</Text>
              <Text> Dashboard öffnen</Text>
            </Text>
            <Text>
              <Text color="gray" bold>[Esc]</Text>
              <Text dimColor> Überspringen</Text>
            </Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // 2. DASHBOARD SCREEN (Mission Control)
  if (screenState === 'DASHBOARD') {
    return (
      <DashboardScreen
        phase={phase}
        onBack={() => setScreenState('MENU')}
        onCdkGuide={() => setScreenState('CDK_GUIDE')}
      />
    );
  }

  // 2.5. TIME MACHINE DIALOG
  if (screenState === 'TIME_MACHINE') {
    const handleTimeMachineRestore = async () => {
      setIsRestoring(true);
      setRestoreMessage(null);
      try {
        const abandonedPath = await timeMachine.restoreCheckpoint(phase);
        const relativePath = timeMachine.getRelativeSnapshotPath(phase, abandonedPath.split('/').pop()?.replace('.zip', '') || 'abandoned');
        setRestoreMessage(`Phase ${phase} zurückgesetzt. Alter Code: ${relativePath}`);
        setScreenState('BRIEFING');
      } catch (error) {
        setRestoreMessage(`Fehler: ${error instanceof Error ? error.message : 'Unknown'}`);
        setScreenState('BRIEFING');
      } finally {
        setIsRestoring(false);
      }
    };

    return (
      <Box flexDirection="column" padding={1}>
        <TimeMachineDialog
          phase={phase}
          onConfirm={handleTimeMachineRestore}
          onCancel={() => setScreenState('BRIEFING')}
          isRestoring={isRestoring}
        />
        {restoreMessage && (
          <Box marginTop={1}>
            <Text color={restoreMessage.includes('Fehler') ? 'red' : 'green'}>{restoreMessage}</Text>
          </Box>
        )}
      </Box>
    );
  }

  // 2.55 CDK_MISSING - Lambda not in CDK stack
  if (screenState === 'CDK_MISSING' && cdkStatus.needed) {
    return (
      <Box flexDirection="column" padding={2}>
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="yellow"
          padding={2}
        >
          <Text bold color="yellow">🔧 CDK-Änderung erforderlich</Text>

          <Box marginY={1} flexDirection="column">
            <Text>
              <Text color="cyan" bold>{cdkStatus.lambdaName}</Text>
              <Text> ist noch nicht im CDK Stack aktiv.</Text>
            </Text>
            <Box marginTop={1}>
              <Text dimColor>{cdkStatus.reason}</Text>
            </Box>
          </Box>

          <Box
            flexDirection="column"
            borderStyle="single"
            borderColor="cyan"
            padding={1}
            marginY={1}
          >
            <Text bold color="cyan">📚 Lern-Empfehlung:</Text>
            <Text>Nutze den <Text bold color="green">CDK Guide</Text> für geführtes Editieren!</Text>
            <Text dimColor>  • Zeigt exakte Zeilen zum Ändern</Text>
            <Text dimColor>  • Validiert automatisch bei jedem Speichern</Text>
            <Text dimColor>  • Gibt präzises Feedback bei Fehlern</Text>
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text dimColor>Oder: Automatisch anwenden (überspringt Lerninhalt)</Text>
          </Box>

          {isApplyingCdk ? (
            <Box marginTop={2}>
              <Text color="yellow">⏳ Wende CDK-Änderungen an...</Text>
            </Box>
          ) : (
            <Box marginTop={2} gap={3}>
              <Text>
                <Text color="green" bold>[g]</Text>
                <Text bold color="green"> CDK Guide starten</Text>
              </Text>
              <Text>
                <Text color="yellow" bold>[a]</Text>
                <Text dimColor> Auto-Apply</Text>
              </Text>
              <Text>
                <Text color="gray" bold>[s]</Text>
                <Text dimColor> Skip</Text>
              </Text>
            </Box>
          )}
        </Box>

        <Box marginTop={1}>
          <Text dimColor>
            Datei: <Text color="white">cdk/lib/workshop-stack.ts</Text>
          </Text>
        </Box>
      </Box>
    );
  }

  // 2.56 CDK_GUIDE - Guided CDK editing with live validation
  if (screenState === 'CDK_GUIDE') {
    return (
      <CdkGuideScreen
        phase={phase}
        onComplete={() => {
          setCdkStatus({ needed: false });
          setScreenState('BRIEFING');
        }}
        onBack={() => setScreenState('CDK_MISSING')}
      />
    );
  }

  // 2.6 GUIDE OFFER (Ask user if they want the guided tour)
  if (screenState === 'GUIDE_OFFER' && hasTourSteps) {
    const tourSteps = phaseTourSteps[phase];
    const phaseTopics: Record<number, string> = {
      1: 'Lambda-Patterns, DI Container und das Result<T,E> Pattern',
      2: 'Fan-Out Pattern, SQS Messages und DB-Marker erstellen',
      3: 'Worker Pattern, Self-Triggering und Batch-Verarbeitung',
      4: 'Polling mit Exponential Backoff und Status-Checks',
      5: 'End-to-End Test und Gesamtflow verstehen',
    };

    return (
      <Box flexDirection="column" padding={2}>
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="magenta"
          padding={2}
        >
          <Text bold color="magenta">📚 Interaktiver Code-Guide verfügbar!</Text>

          <Box marginY={1} flexDirection="column">
            <Text>In dieser Phase geht es um:</Text>
            <Text color="cyan" bold>  {phaseTopics[phase] || `Phase ${phase} Konzepte`}</Text>
          </Box>

          <Box marginY={1} flexDirection="column">
            <Text>Der Guide führt dich durch <Text bold color="yellow">{tourSteps.length} Stationen</Text> mit:</Text>
            <Text dimColor>  • Code-Beispiele mit Live-Validierung</Text>
            <Text dimColor>  • Erklärungen zu jedem Pattern</Text>
            <Text dimColor>  • Interaktive Proof-of-Concept Tests</Text>
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text dimColor>Du kannst ihn jederzeit mit <Text color="magenta" bold>[g]</Text> öffnen.</Text>
          </Box>

          <Box marginTop={2} gap={3}>
            <Text>
              <Text color="green" bold>[j]</Text>
              <Text> Ja, Guide starten</Text>
            </Text>
            <Text>
              <Text color="yellow" bold>[n]</Text>
              <Text> Nein, direkt loslegen</Text>
            </Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // 2.7 CODE TOUR (Interactive Tour for any phase)
  if (screenState === 'CODE_TOUR' && hasTourSteps) {
    const tourSteps = phaseTourSteps[phase];

    const handleTourComplete = async () => {
      setScreenState('BRIEFING');
      setTourCompleted(true);
      // Persist tour completion
      try {
        await stateManager.updateState(state => ({
          ...state,
          tourCompleted: { ...state.tourCompleted, [phase]: true },
        }));
      } catch {
        // Silent failure
      }
    };

    return (
      <InteractiveCodeTour
        steps={tourSteps}
        onComplete={handleTourComplete}
      />
    );
  }

  // 2.7 SECRET INPUT (Phase 1 - Break-it Challenge)
  if (screenState === 'SECRET_INPUT' && phase === 1) {
    // Compact layout for small terminals (< 30 rows)
    const isCompact = terminalSize.rows < 30;

    return (
      <Box flexDirection="column" padding={1} width="100%" height="100%" overflow="hidden">
        {/* Deploy Pipeline Status */}
        <Box marginBottom={1} flexShrink={0}>
          <DeploymentPipeline state={reactiveLoop} watching={reactiveLoop.watching} breakItMode={true} />
        </Box>

        <Box
          flexDirection="column"
          borderStyle="double"
          borderColor="yellow"
          paddingX={2}
          paddingY={isCompact ? 0 : 1}
          flexGrow={1}
          overflow="hidden"
        >
          <Text bold color="yellow">
            🔐 Break it! Challenge
          </Text>
          <Text dimColor>Diese Challenge beweist, dass du Debugging mit CloudWatch Logs beherrschst.</Text>

          {!isCompact && (
            <Box flexDirection="column" marginY={1} paddingLeft={1}>
              <Text color="cyan">So findest du das Secret:</Text>
              <Text dimColor>1. Öffne <Text color="white">get-table-list-lambda/src/interfaces/lambda-handler.ts</Text></Text>
              <Text dimColor>2. Füge <Text color="yellow">throw new Error('test');</Text> nach Zeile 72 ein → Speichern</Text>
              <Text dimColor>3. <Text color="green">[Esc]</Text> → <Text color="green">[L]</Text> für LiveLogViewer → im <Text color="red">LAMBDA_ERROR</Text> die <Text color="yellow">releaseId</Text> finden</Text>
            </Box>
          )}

          {/* Wordle-style Secret Code Input */}
          <Box flexGrow={1} flexDirection="column" justifyContent="center">
            <SecretCodeInput
              secret={breakItNonce || PHASE1_MASTER_CODE}
              masterSecret={PHASE1_MASTER_CODE}
              onSuccess={() => {
                // Show restoring screen, then restore and proceed
                setScreenState('RESTORING');
              }}
              onCancel={() => setScreenState('MENU')}
            />
          </Box>

          <Box justifyContent="center">
            <Text dimColor>[Esc] Zurück</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // 2.8 RESTORING (After successful break-it challenge)
  if (screenState === 'RESTORING' && phase === 1) {
    return (
      <Box flexDirection="column" padding={2} alignItems="center" justifyContent="center" height="100%">
        <Box
          flexDirection="column"
          borderStyle="double"
          borderColor="green"
          paddingX={4}
          paddingY={2}
          alignItems="center"
        >
          <Text bold color="green">✓ ACCESS GRANTED</Text>
          <Box marginY={1}>
            <Text color="cyan">Stelle Lambda wieder her...</Text>
          </Box>
          <Text dimColor>Dein Code wird auf den Stand vor dem Fehler zurückgesetzt.</Text>
          <Text dimColor>Du brauchst nichts zu tun.</Text>
        </Box>
      </Box>
    );
  }

  // 3. HINTS VIEWER (Progressive)
  if (screenState === 'HINTS' && tutorial?.hints) {
    return (
      <ProgressiveHintViewer
        hints={tutorial.hints}
        initialIndex={initialHintIndex}
        onProgressChange={async (index) => {
          setInitialHintIndex(index);
          // Persist in background, don't block
          stateManager.saveHintProgress(phase, index).catch(() => {});
        }}
        onAllHintsSeen={() => {
          // Navigate FIRST (synchronous), then persist in background.
          // Nur in den Solution-Screen springen, wenn es eine Lösung GIBT -
          // Phasen 0/1/5 haben Hints, aber keine Musterlösung!
          setAllHintsSeen(true);
          setScreenState(solutionExists ? 'SOLUTION' : 'MENU');
          // Persist in background, don't block navigation
          stateManager.markAllHintsSeen(phase).catch(() => {});
        }}
        onBack={() => setScreenState('MENU')}
      />
    );
  }

  // 3. VALIDATING SPINNER
  if (screenState === 'VALIDATING' || validating) {
    return (
      <Box height="100%" justifyContent="center" alignItems="center">
        <LoadingSpinner message={`Validiere Phase ${phase}...`} />
      </Box>
    );
  }

  // 3. MISSION BRIEFING
  if (screenState === 'BRIEFING' && !result?.passed) {
    const objectives = tutorial?.learningObjectives || [];

    // Use column layout when terminal is short (< 35 rows)
    const needsColumnLayout = terminalSize.rows < 35;

    // Split objectives into two columns if needed
    const midPoint = Math.ceil(objectives.length / 2);
    const leftColumn = objectives.slice(0, midPoint);
    const rightColumn = objectives.slice(midPoint);

    return (
      <Box height="100%" flexDirection="column" padding={1}>
        {/* Header */}
        <PhaseHeader
          phase={phase}
          title={phaseInfo.name}
          showBigText={!terminalSize.isVeryShort}
        />

        {/* Reactive Loop Pipeline - Auto Build/Deploy/Test on file save */}
        <Box marginY={1} flexShrink={0}>
          <DeploymentPipeline state={reactiveLoop} watching={reactiveLoop.watching} />
        </Box>

        {/* Prerequisite status for phases 2+ */}
        {phase >= 2 && PHASE_CONFIG[phase]?.requiredLambdas?.length > 0 && (
          <Box flexShrink={0}>
            <Text dimColor>
              {PHASE_CONFIG[phase].requiredLambdas.map(name => `✓ ${name}`).join('  ')}
            </Text>
          </Box>
        )}

        {/* Content - flexShrink={0} prevents compression */}
        <Box flexDirection="column" flexShrink={0}>
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="blue"
            padding={1}
            marginTop={1}
            flexShrink={0}
          >
            <Text bold color="yellow">🎯 Deine Mission:</Text>
            {needsColumnLayout ? (
              // Two-column layout for small terminals
              <Box marginTop={1} flexDirection="row" gap={2} flexShrink={0}>
                <Box flexDirection="column" flexBasis="50%">
                  {leftColumn.map((obj) => (
                    <Text key={`obj-left-${obj}`}> • {obj}</Text>
                  ))}
                </Box>
                <Box flexDirection="column" flexBasis="50%">
                  {rightColumn.map((obj) => (
                    <Text key={`obj-right-${obj}`}> • {obj}</Text>
                  ))}
                </Box>
              </Box>
            ) : (
              // Single column layout
              <Box marginTop={1} flexDirection="column" flexShrink={0}>
                {objectives.map((obj) => (
                  <Text key={`obj-${obj}`}> • {obj}</Text>
                ))}
              </Box>
            )}
          </Box>
        </Box>

        {/* Spacer */}
        <Box flexGrow={1} />

        {/* Footer with hotkeys */}
        <Box
          borderStyle="single"
          borderTop
          borderLeft={false}
          borderRight={false}
          borderBottom={false}
          borderColor="gray"
          flexShrink={0}
          gap={2}
        >
          <Text>
            <Text color="cyan" bold>[t]</Text>
            <Text dimColor> Tutorial</Text>
          </Text>
          {hasTourSteps && (
            <Text>
              <Text color="magenta" bold>[g]</Text>
              <Text dimColor> Guide</Text>
            </Text>
          )}
          <Text>
            <Text color="green" bold>[v]</Text>
            <Text dimColor> Validieren</Text>
          </Text>
          {hasHints && (
            <Text>
              <Text color="yellow" bold>[h]</Text>
              <Text dimColor> Hints</Text>
            </Text>
          )}
          {solutionExists && phase > 1 && (
            allHintsSeen ? (
              <Text>
                <Text color="magenta" bold>[l]</Text>
                <Text dimColor> Lösung</Text>
              </Text>
            ) : (
              <Text dimColor>[l] Lösung (erst nach Hints)</Text>
            )
          )}
          {(backupExists || checkpointExists) && (
            <Text>
              <Text color="red" bold>[r]</Text>
              <Text dimColor> {isRestoring ? 'Wiederherstellen...' : backupExists ? 'Reset' : 'Reset Phase'}</Text>
            </Text>
          )}
        </Box>
      </Box>
    );
  }

  // 5. MAIN MENU (Nach Validierung)

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <PhaseHeader phase={phase} title={phaseInfo.name} />

      {/* Reactive Loop Pipeline - Auto Build/Deploy/Test on file save */}
      <Box marginY={1} flexShrink={0}>
        <DeploymentPipeline state={reactiveLoop} watching={reactiveLoop.watching} />
      </Box>

      {/* Status */}
      {result?.passed ? (
        <Box flexDirection="column" marginY={1} borderStyle="round" borderColor={phase === 1 ? 'yellow' : 'green'} padding={1} flexShrink={0}>
          {phase === 1 ? (
            <Box flexDirection="column">
              <Text bold color="yellow">✓ Validierung bestanden!</Text>
              <Text color="white">Break it! Challenge - finde das Secret um Phase 2 freizuschalten! → <Text bold color="green">[Enter]</Text></Text>
            </Box>
          ) : (
            <Text bold color="green">✓ Phase erfolgreich abgeschlossen!</Text>
          )}
        </Box>
      ) : phase === 1 && inBreakItChallenge ? (
        <Box flexDirection="column" marginY={1} borderStyle="round" borderColor="yellow" padding={1} flexShrink={0}>
          <Box flexDirection="column">
            <Text bold color="yellow">🔐 Break it! Challenge läuft</Text>
            <Text color="white">Drücke <Text bold color="green">[B]</Text> um zurück zur Challenge zu gehen</Text>
            <Text dimColor>oder [L] für den Log Viewer</Text>
          </Box>
        </Box>
      ) : null}


      {!result?.passed && !inBreakItChallenge && (
        <Box flexDirection="column" marginY={1} flexShrink={0}>
          {/* Phase 1: Reference code to study, other phases: Implementation target */}
          {phase === 1 ? (
            <Box borderStyle="round" borderColor="green" padding={1} flexShrink={0}>
              <Box flexDirection="column">
                <Text bold color="green">📚 Studiere den Referenz-Code:</Text>
                <Box marginTop={1} flexDirection="column">
                  {phaseInfo.watchPaths.map((watchPath) => {
                    const cleanPath = watchPath.replace('./', '').replace('/**/*.ts', '');
                    const absolutePath = path.resolve(process.cwd(), '..', '..', cleanPath);
                    const packageName = cleanPath.split('/')[1] || cleanPath;
                    return (
                      <Box key={`watch-done-${watchPath}`} marginLeft={1}>
                        <Text dimColor>→ </Text>
                        <FileLink
                          path={absolutePath}
                          label={packageName}
                          color="green"
                        />
                        <Text dimColor>  (bereits implementiert!)</Text>
                      </Box>
                    );
                  })}
                </Box>
                <Box marginTop={1}>
                  <Text dimColor>Dann: Validieren [v] → Break it! Challenge</Text>
                </Box>
              </Box>
            </Box>
          ) : (
            <Box borderStyle="round" borderColor="cyan" padding={1} flexShrink={0}>
              <Box flexDirection="column">
                <Text bold color="cyan">📂 Implementiere in:</Text>
                <Box marginTop={1} flexDirection="column">
                  {phaseInfo.watchPaths.map((watchPath) => {
                    const cleanPath = watchPath.replace('./', '').replace('/**/*.ts', '');
                    const absolutePath = path.resolve(process.cwd(), '..', '..', cleanPath);
                    const packageName = cleanPath.split('/')[1] || cleanPath;
                    return (
                      <Box key={`watch-todo-${watchPath}`} marginLeft={1}>
                        <Text dimColor>→ </Text>
                        <FileLink
                          path={absolutePath}
                          label={packageName}
                          color="cyan"
                        />
                        <Text dimColor>  ({cleanPath})</Text>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            </Box>
          )}

          {/* Validation Results - compact */}
          {result && !result.passed && (
            <Box borderStyle="round" borderColor="yellow" paddingX={1} marginTop={1} flexShrink={0}>
              <Box flexDirection="column">
                <Text bold color="yellow">⛔ Fehlgeschlagen: </Text>
                {result.hints && result.hints.filter(h => h !== '').slice(0, 4).map((hint) => (
                  <Text key={`hint-${hint.slice(0, 20)}`} color="white"> {hint}</Text>
                ))}
                {allHintsSeen && <Text dimColor> [l] Lösung</Text>}
              </Box>
            </Box>
          )}
        </Box>
      )}

      {/* Spacer */}
      <Box flexGrow={1} />

      {/* Footer - Horizontal Hotkeys */}
      <Box
        borderStyle="single"
        borderTop
        borderLeft={false}
        borderRight={false}
        borderBottom={false}
        borderColor="gray"
        flexShrink={0}
        gap={2}
      >
        {result?.passed ? (
          <>
            <Text>
              <Text color="green" bold>[Enter]</Text>
              <Text dimColor> Phase {phase + 1}</Text>
            </Text>
            {tutorial && (
              <Text>
                <Text color="cyan" bold>[t]</Text>
                <Text dimColor> Tutorial</Text>
              </Text>
            )}
            {(backupExists || checkpointExists) && (
              <Text>
                <Text color="red" bold>[r]</Text>
                <Text dimColor> {isRestoring ? 'Wiederherstellen...' : backupExists ? 'Reset' : 'Reset Phase'}</Text>
              </Text>
            )}
          </>
        ) : (
          <>
            <Text>
              <Text color="green" bold>[v]</Text>
              <Text dimColor> Validieren</Text>
            </Text>
            {tutorial && (
              <Text>
                <Text color="cyan" bold>[t]</Text>
                <Text dimColor> Tutorial</Text>
              </Text>
            )}
            {hasHints && (
              <Text>
                <Text color="yellow" bold>[h]</Text>
                <Text dimColor> Hints</Text>
              </Text>
            )}
            {solutionExists && phase > 1 && (
              allHintsSeen ? (
                <Text>
                  <Text color="magenta" bold>[l]</Text>
                  <Text dimColor> Lösung</Text>
                </Text>
              ) : (
                <Text dimColor>[l] Lösung (erst nach Hints)</Text>
              )
            )}
            {(backupExists || checkpointExists) && (
              <Text>
                <Text color="red" bold>[r]</Text>
                <Text dimColor> {isRestoring ? 'Wiederherstellen...' : backupExists ? 'Reset' : 'Reset Phase'}</Text>
              </Text>
            )}
          </>
        )}
      </Box>
    </Box>
  );
};
