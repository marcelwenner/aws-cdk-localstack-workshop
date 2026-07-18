import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { spawn } from 'child_process';
import { PhaseScreen } from './screens/PhaseScreen.js';
import { TutorialScreen } from './screens/TutorialScreen.js';
import { WelcomeScreen } from './screens/WelcomeScreen.js';
import { PhaseTutorialScreen } from './screens/PhaseTutorialScreen.js';
import { StatusScreen } from './screens/StatusScreen.js';
import { QuizScreen } from './screens/QuizScreen.js';
import { QuizResultsScreen } from './screens/QuizResultsScreen.js';
import { FireworksScreen } from './screens/FireworksScreen.js';
import { CertificateScreen } from './screens/CertificateScreen.js';
import { CheatSheetScreen } from './screens/CheatSheetScreen.js';
import { getTutorial } from './lib/tutorials/index.js';
import { LoadingSpinner } from './components/animations/LoadingSpinner.js';
import { LiveLogViewer } from './components/display/LiveLogViewer.js';
import { useWorkshopState } from './hooks/useWorkshopState.js';
import { useExitHandler } from './hooks/useExitHandler.js';
import { useFileWatcher } from './hooks/useFileWatcher.js';
import { useLiveLogStream } from './hooks/useLiveLogStream.js';
import { useSystemStatus } from './hooks/useSystemStatus.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { DashboardLayout } from './components/layouts/DashboardLayout.js';
import { CompactLayout } from './components/layouts/CompactLayout.js';
import { FocusLayout } from './components/layouts/FocusLayout.js';
import { TerminalSizeWarning } from './components/warnings/TerminalSizeWarning.js';
import { workshopConfig } from './core/config/workshop.config.js';
import { StateManager, type QuizResult, type PhaseTime } from './core/state/workshop-state.js';
import { AwsInfrastructure } from './core/infrastructure/aws-infrastructure.js';
import { applyCdkChanges } from './lib/cdk-operations.js';
import { PHASE_CONFIG, getPhaseForLambda, type LambdaName } from './shared/constants.js';
import { applySolution, hasSolution } from './lib/file-operations.js';

type Screen = 'phase' | 'tutorial' | 'status' | 'quiz' | 'quiz-results' | 'certificate' | 'fireworks';

const stateManager = new StateManager();
const infrastructure = new AwsInfrastructure();

/** Check if all required lambdas for a phase are deployed */
async function checkPhasePrerequisites(phase: number): Promise<string[]> {
  const config = PHASE_CONFIG[phase];
  if (!config) return [];

  const missing: string[] = [];
  for (const lambdaName of config.requiredLambdas) {
    const exists = await infrastructure.lambdaExists(lambdaName);
    if (!exists) missing.push(lambdaName);
  }
  return missing;
}

/**
 * Self-healing auto-deploy: Apply solutions for missing Lambdas
 * Returns true if solutions were applied and CDK should be re-deployed
 */
async function applySolutionsForMissingLambdas(missingLambdas: string[]): Promise<boolean> {
  let solutionsApplied = false;

  for (const lambdaName of missingLambdas) {
    const phase = getPhaseForLambda(lambdaName as LambdaName);
    if (phase !== null && await hasSolution(phase)) {
      try {
        await applySolution(phase);
        solutionsApplied = true;
      } catch {
        // Solution application failed - continue with others
      }
    }
  }

  return solutionsApplied;
}

export const WorkshopApp: React.FC = () => {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>('phase');
  const [showWelcome, setShowWelcome] = useState(true);

  // Exit handler should be disabled during welcome screen (WelcomeScreen handles its own exit)
  const { exitWarning } = useExitHandler({ isActive: !showWelcome });
  const { state, loading, currentPhase, completedPhases, setPhase, markPhaseComplete } = useWorkshopState();
  const [showLogs, setShowLogs] = useState(false);
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [terminalWarningDismissed, setTerminalWarningDismissed] = useState(false);
  const [hintsActive, setHintsActive] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [watcherActive, setWatcherActive] = useState(false);
  const [phaseTimes, setPhaseTimes] = useState<Record<number, PhaseTime>>({});
  const [currentPhaseProgress, setCurrentPhaseProgress] = useState(0);
  const [missingLambdas, setMissingLambdas] = useState<string[]>([]);
  const [autoDeploying, setAutoDeploying] = useState(false);
  const [deployRetry, setDeployRetry] = useState(0);
  const [deployError, setDeployError] = useState<{
    type: 'docker' | 'localstack' | 'cdk' | 'unknown';
    message: string;
    command?: string;
  } | null>(null);

  // Helper: Run command with spawn (non-blocking for UI)
  const runSpawnCommand = React.useCallback((cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ success: boolean; stderr: string }> => {
    return new Promise((resolve) => {
      let stderr = '';

      const child = spawn(cmd, args, {
        cwd,
        stdio: ['ignore', 'ignore', 'pipe'], // Capture stderr only
        shell: true,
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      const timer = setTimeout(() => {
        child.kill();
        resolve({ success: false, stderr: 'Timeout' });
      }, timeoutMs);

      child.on('error', (err: Error) => {
        clearTimeout(timer);
        resolve({ success: false, stderr: err.message });
      });

      child.on('exit', (code: number | null) => {
        clearTimeout(timer);
        resolve({ success: code === 0, stderr });
      });
    });
  }, []);

  // Check prerequisites when phase changes - auto-deploy if missing (SELF-HEALING)
  // IMPORTANT: Only runs AFTER welcome screen is closed
  React.useEffect(() => {
    const checkAndDeploy = async () => {
      // Don't run during welcome screen or on phase 0
      if (showWelcome || currentPhase <= 0) {
        setMissingLambdas([]);
        setDeployError(null);
        return;
      }

      const missing = await checkPhasePrerequisites(currentPhase);
      if (missing.length === 0) {
        setMissingLambdas([]);
        setDeployError(null);
        return;
      }

      // SELF-HEALING AUTO-DEPLOY PIPELINE
      setAutoDeploying(true);
      setMissingLambdas(missing);
      setDeployError(null);

      const MAX_RETRIES = 3;
      let lastMissing = missing;
      let lastError: typeof deployError = null;
      const rootDir = process.cwd().replace('/packages/workshop-cli', '');

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          // STEP 1: Apply solutions for missing Lambdas (if available)
          if (attempt > 1) {
            const solutionsApplied = await applySolutionsForMissingLambdas(lastMissing);
            if (solutionsApplied) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }

          // STEP 2: Activate CDK code for all phases up to current
          for (let p = 1; p <= currentPhase; p++) {
            await applyCdkChanges(p);
          }

          // STEP 3: Run CDK bootstrap (non-blocking with spawn)
          await runSpawnCommand('npx', ['cdklocal', 'bootstrap'], `${rootDir}/cdk`, 60000);

          // STEP 4: Deploy CDK stack (non-blocking with spawn)
          const deployResult = await runSpawnCommand(
            'npx',
            ['cdklocal', 'deploy', '--require-approval', 'never'],
            `${rootDir}/cdk`,
            120000
          );

          if (!deployResult.success) {
            throw new Error(deployResult.stderr);
          }

          // STEP 5: Re-check after deploy
          const stillMissing = await checkPhasePrerequisites(currentPhase);

          if (stillMissing.length === 0) {
            setMissingLambdas([]);
            setDeployError(null);
            setAutoDeploying(false);
            return;
          }

          lastMissing = stillMissing;
          setMissingLambdas(stillMissing);

          if (attempt < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        } catch (err) {
          // Parse error to give intelligent feedback
          const errorStr = err instanceof Error ? err.message : String(err);

          if (errorStr.includes('ECONNREFUSED') || errorStr.includes('Cannot connect')) {
            if (errorStr.includes('4566')) {
              lastError = {
                type: 'localstack',
                message: 'LocalStack ist nicht erreichbar (Port 4566)',
                command: 'Workshop neu starten: [q] drücken, dann "npm run workshop"',
              };
            } else {
              lastError = {
                type: 'docker',
                message: 'Docker oder Container sind nicht erreichbar',
                command: 'Workshop neu starten: [q] drücken, dann "npm run workshop"',
              };
            }
          } else if (errorStr.includes('ResourceNotFoundException') || errorStr.includes('does not exist')) {
            lastError = {
              type: 'localstack',
              message: 'LocalStack wurde zurückgesetzt - Infrastruktur fehlt',
              command: 'Workshop neu starten: [q] drücken, dann "npm run workshop"',
            };
          } else if (errorStr.includes('SyntaxError') || errorStr.includes('TypeError') || errorStr.includes('Cannot find module')) {
            lastError = {
              type: 'cdk',
              message: 'CDK Stack hat einen Syntax-Fehler',
              command: 'Prüfe: cdk/lib/workshop-stack.ts (TypeScript Fehler beheben)',
            };
          } else if (errorStr.includes('ETIMEDOUT') || errorStr.includes('timeout') || errorStr === 'Timeout') {
            lastError = {
              type: 'localstack',
              message: 'LocalStack antwortet nicht (Timeout)',
              command: 'Workshop neu starten: [q] drücken, dann "npm run workshop"',
            };
          } else {
            lastError = {
              type: 'unknown',
              message: errorStr.slice(0, 200) || 'Unbekannter Fehler beim Deployment',
              command: 'Workshop neu starten: [q] drücken, dann "npm run workshop"',
            };
          }

          if (attempt < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }
      }

      // All retries exhausted - show intelligent error
      setDeployError(lastError);
      setAutoDeploying(false);
    };
    checkAndDeploy();
  }, [showWelcome, currentPhase, deployRetry, runSpawnCommand]);

  // Check terminal size
  const terminalSize = useTerminalSize();

  // Get current phase info
  const currentPhaseInfo = workshopConfig.phases.find(p => p.id === currentPhase);

  // File watcher for current phase (only active when not on welcome/tutorial/status screens)
  const watcherState = useFileWatcher({
    paths: currentPhaseInfo?.watchPaths || [],
    enabled: !showWelcome && screen === 'phase' && currentPhase > 0,
  });

  // Live log streaming - lambda depends on current phase (from central config)
  const currentLambdaName = PHASE_CONFIG[currentPhase]?.logLambda || workshopConfig.lambdas.GetTableList;

  const logStream = useLiveLogStream({
    lambdaName: currentLambdaName,
    enabled: showLogs,
  });

  // System status (Docker, LocalStack, Postgres)
  const systemStatus = useSystemStatus();

  // Load phase times and calculate current phase progress
  React.useEffect(() => {
    const loadProgress = async () => {
      try {
        const times = await stateManager.getAllPhaseTimes();

        setPhaseTimes(times);

        // Calculate progress within current phase based on actual work:
        // - Timer started: 25% (phase begun)
        // - Watcher active: 25% (engaged in coding)
        // - File changes detected: up to 50% (based on change count, max at 5 changes)
        let progress = 0;
        if (times[currentPhase]?.startedAt) progress += 25;
        if (watcherActive) progress += 25;
        // File changes show actual work being done
        const changeCount = watcherState.changeCount || 0;
        progress += Math.min(50, changeCount * 10);

        setCurrentPhaseProgress(progress);
      } catch {
        // Ignore errors
      }
    };

    loadProgress();
  }, [currentPhase, watcherActive, watcherState.changeCount]); // Reload when phase, watcher, or changes update

  // Check if we're in a screen that handles its own hotkeys
  const isTutorialScreen = screen === 'tutorial' || (currentPhase === 0 && screen === 'phase');
  const isFireworksScreen = screen === 'fireworks' || screen === 'certificate';
  const isFullscreenMode = isTutorialScreen || isFireworksScreen || showCheatSheet;
  const disableGlobalHotkeys = isTutorialScreen || isFireworksScreen || hintsActive || isModalOpen || showCheatSheet;

  // Keyboard shortcuts (disabled during welcome screen - WelcomeScreen has its own input handling)
  useInput((input, key) => {
    // Handle terminal warning dismissal
    if (terminalSize.isTooSmall && !terminalWarningDismissed) {
      if (key.return) {
        setTerminalWarningDismissed(true);
      }
      return;
    }

    // Handle infrastructure failure alert dismissal
    if (systemStatus.justFailed) {
      if (key.return) {
        systemStatus.dismissAlert();
      }
      return;
    }

    // Handle missing prerequisites - retry deploy on Enter, quit on q
    if (missingLambdas.length > 0 && !autoDeploying) {
      if (key.return) {
        // Trigger retry of auto-deploy
        setDeployRetry(r => r + 1);
      } else if (input === 'q') {
        // Allow quitting when deploy failed
        exit();
      }
      return; // Block all other input while prerequisites missing
    }

    // Don't handle shortcuts during exit warning, tutorial, or hints
    if (exitWarning || disableGlobalHotkeys) return;

    // Escape closes logs view
    if (key.escape && showLogs) {
      setShowLogs(false);
      return;
    }

    switch (input) {
      case 'L':
        // Toggle logs (capital L to avoid conflict with [l] Lösung)
        setShowLogs(prev => !prev);
        break;
      case 's':
        // Show status screen
        if (!showLogs) {
          setScreen('status');
        }
        break;
      case 'm':
        // Toggle compact mode
        setCompactMode(prev => !prev);
        break;
      case 'q':
        // Quit (same as exit)
        exit();
        break;
      case '?':
        // Toggle cheat sheet
        setShowCheatSheet((prev) => !prev);
        break;
      // 'h' for hints is context-dependent, handled in PhaseScreen
      // 'l' for Lösung is handled in PhaseScreen
    }
  }, { isActive: !showWelcome });

  // State loading (workshop state from disk)
  if (loading) {
    return <LoadingSpinner message="Workshop wird geladen..." />;
  }

  // Show terminal size warning before anything else
  if (terminalSize.isTooSmall && !terminalWarningDismissed) {
    return (
      <Box flexDirection="column" padding={2}>
        <TerminalSizeWarning
          currentSize={`${terminalSize.columns}x${terminalSize.rows}`}
          recommendedSize={terminalSize.recommendedSize}
          isNarrow={terminalSize.isNarrow}
          isShort={terminalSize.isShort}
        />
      </Box>
    );
  }

  if (showWelcome) {
    return (
      <WelcomeScreen
        onStart={() => setShowWelcome(false)}
        onExit={() => exit()}
      />
    );
  }

  const phaseTitle = currentPhaseInfo?.name;

  // Wrap all content in DashboardLayout
  const renderContent = () => {
    // Special handling for Phase 0: Go directly to tutorial
    if (currentPhase === 0 && screen === 'phase') {
      return (
        <TutorialScreen
          onComplete={() => {
            markPhaseComplete(0);
            // After tutorial, move to Phase 1
          }}
        />
      );
    }

    if (screen === 'tutorial') {
      // Phase 0 tutorial
      if (currentPhase === 0) {
        return (
          <TutorialScreen
            onComplete={() => {
              markPhaseComplete(0);
              setScreen('phase');
            }}
          />
        );
      }

      // Phase 1+ tutorials (fullscreen, no sidebar)
      const tutorial = getTutorial(currentPhase);
      if (tutorial) {
        return (
          <PhaseTutorialScreen
            tutorial={tutorial}
            onBack={() => setScreen('phase')}
          />
        );
      }
    }

    if (screen === 'status') {
      return (
        <StatusScreen
          currentPhase={currentPhase}
          completedPhases={completedPhases}
          startTime={state.startTime}
          onBack={() => setScreen('phase')}
        />
      );
    }

    if (screen === 'quiz') {
      const quiz = currentPhaseInfo?.quiz;
      if (!quiz) {
        // No quiz configured, skip to next phase
        setScreen('phase');
        return null;
      }

      return (
        <QuizScreen
          phase={currentPhase}
          quiz={quiz}
          onComplete={async (result) => {
            await stateManager.markQuizComplete(currentPhase, result);
            setQuizResult(result);
            setScreen('quiz-results');
          }}
        />
      );
    }

    if (screen === 'quiz-results') {
      if (!quizResult) {
        setScreen('phase');
        return null;
      }

      return (
        <QuizResultsScreen
          result={quizResult}
          phase={currentPhase}
          onContinue={() => {
            const nextPhase = currentPhase + 1;
            markPhaseComplete(currentPhase);
            setQuizResult(null);
            if (nextPhase > 6) {
              // Prüfung + Quiz geschafft → Zertifikat, dann Feuerwerk
              setScreen('certificate');
              return;
            }
            setPhase(nextPhase);
            setScreen('phase');
          }}
        />
      );
    }

    // Zertifikat nach bestandener Abschlussprüfung (vor dem Feuerwerk)
    if (screen === 'certificate') {
      return <CertificateScreen onDone={() => setScreen('fireworks')} />;
    }

    // Fireworks celebration screen (after completing all phases)
    if (screen === 'fireworks') {
      return (
        <FireworksScreen
          startTime={state.startTime}
          onExit={() => exit()}
        />
      );
    }

    // Show auto-deploy progress or error if infrastructure missing
    if (missingLambdas.length > 0 || autoDeploying) {
      const errorIcon = deployError?.type === 'docker' ? '🐳' :
                        deployError?.type === 'localstack' ? '☁️' :
                        deployError?.type === 'cdk' ? '🔧' : '❌';

      const needsRestart = deployError?.type === 'docker' ||
                           deployError?.type === 'localstack' ||
                           deployError?.type === 'unknown';

      return (
        <Box flexDirection="column" padding={2}>
          <Box borderStyle="double" borderColor={autoDeploying ? 'cyan' : 'red'} padding={1} flexDirection="column">
            {autoDeploying ? (
              <>
                <Text bold color="cyan">Infrastruktur wird wiederhergestellt...</Text>
                <Box marginY={1}>
                  <Text color="yellow">CDK Deploy läuft - bitte warten (bis zu 2 Min)</Text>
                </Box>
                <Box flexDirection="column">
                  <Text dimColor>Fehlende Lambdas:</Text>
                  {missingLambdas.map((name) => (
                    <Text key={`deploying-${name}`} dimColor>  - {name}</Text>
                  ))}
                </Box>
              </>
            ) : (
              <>
                <Text bold color="red">{errorIcon} Auto-Deploy fehlgeschlagen</Text>

                {/* Intelligent error message */}
                {deployError && (
                  <Box marginY={1} flexDirection="column">
                    <Text color="yellow" wrap="wrap">{deployError.message}</Text>
                  </Box>
                )}

                {/* Show missing lambdas */}
                <Box marginY={1} flexDirection="column">
                  <Text dimColor>Fehlende Lambdas:</Text>
                  {missingLambdas.map((name) => (
                    <Text key={`missing-${name}`} color="yellow">  - {name}</Text>
                  ))}
                </Box>

                {/* Action hint based on error type */}
                <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column">
                  {needsRestart ? (
                    <>
                      <Text>
                        <Text color="cyan" bold>[q]</Text> Workshop beenden
                      </Text>
                      <Text dimColor>Danach: npm run workshop</Text>
                    </>
                  ) : (
                    <>
                      <Text wrap="wrap" dimColor>{deployError?.command}</Text>
                      <Box marginTop={1}>
                        <Text>
                          <Text color="cyan" bold>[Enter]</Text> Erneut versuchen
                          {'  '}
                          <Text color="cyan" bold>[q]</Text> Beenden
                        </Text>
                      </Box>
                    </>
                  )}
                </Box>
              </>
            )}
          </Box>
        </Box>
      );
    }

    // Default: PhaseScreen (for phases 1-6)
    return (
      <PhaseScreen
        phase={currentPhase}
        onNextPhase={async () => {
          const nextPhase = currentPhase + 1;

          if (nextPhase > 6) {
            // Prüfung bestanden (Quiz bereits absolviert) → Zertifikat, dann Feuerwerk
            markPhaseComplete(currentPhase);
            setScreen('certificate');
            return;
          }

          // Check if current phase has a quiz
          const hasQuiz = !!currentPhaseInfo?.quiz;
          const quizCompleted = await stateManager.isQuizCompleted(currentPhase);

          if (hasQuiz && !quizCompleted) {
            // Show quiz first
            setScreen('quiz');
          } else {
            // Skip quiz, advance directly
            markPhaseComplete(currentPhase);
            setPhase(nextPhase);
          }
        }}
        onTutorial={() => setScreen('tutorial')}
        onExit={() => exit()}
        markPhaseComplete={markPhaseComplete}
        onHintsActiveChange={setHintsActive}
        onModalStateChange={setIsModalOpen}
        onWatcherActivate={() => setWatcherActive(true)}
        disableInput={showLogs}
      />
    );
  };

  // CheatSheet overlay (highest priority)
  if (showCheatSheet) {
    return (
      <Box flexDirection="column" width="100%" height="100%">
        <CheatSheetScreen onClose={() => setShowCheatSheet(false)} />
      </Box>
    );
  }

  const layoutProps = {
    currentPhase,
    phaseTitle,
    completedPhases,
    startTime: state.startTime,
    phaseTimes,
    currentPhaseProgress,
    dockerRunning: systemStatus.dockerRunning,
    localstackRunning: systemStatus.localstackRunning,
    postgresRunning: systemStatus.postgresRunning,
    watcherState: { ...watcherState, active: watcherActive },
  };

  // Always render main content to preserve state, show LogViewer on top when active
  const content = (
    <>
      {/* Main content - hidden but mounted when LogViewer is open to preserve state */}
      <Box display={showLogs ? 'none' : 'flex'} flexDirection="column" width="100%" height="100%">
        {renderContent()}
      </Box>
      {/* LogViewer overlay */}
      {showLogs && (
        <LiveLogViewer
          logs={logStream.logs}
          isStreaming={logStream.isStreaming}
          lambdaName={currentLambdaName}
          error={logStream.error}
        />
      )}
    </>
  );

  // Use FocusLayout for tutorial and solution screens (no sidebar)
  return (
    <Box flexDirection="column" width="100%" height="100%">
      {isFullscreenMode ? (
        <FocusLayout>{content}</FocusLayout>
      ) : compactMode ? (
        <CompactLayout {...layoutProps}>{content}</CompactLayout>
      ) : (
        <DashboardLayout {...layoutProps}>{content}</DashboardLayout>
      )}

      {/* Infrastructure failure warning */}
      {systemStatus.justFailed && (
        <Box
          width="100%"
          justifyContent="center"
          paddingY={1}
          borderStyle="double"
          borderColor="red"
        >
          <Text bold color="red">
            {systemStatus.failedService === 'docker' && '[!] Docker ist gestoppt! Starte Docker Desktop.  '}
            {systemStatus.failedService === 'localstack' && '[!] LocalStack ist gestoppt! Fuhre "docker compose up -d" aus.  '}
            {systemStatus.failedService === 'postgres' && '[!] PostgreSQL ist gestoppt! Fuhre "docker compose up -d" aus.  '}
          </Text>
          <Text color="yellow">[Enter] Schliessen</Text>
        </Box>
      )}

      {/* Exit warning: double Ctrl+C */}
      {exitWarning && (
        <Box
          width="100%"
          justifyContent="center"
          paddingY={1}
          backgroundColor="yellow"
        >
          <Text bold color="black">
            Drücke Ctrl+C nochmal zum Beenden
          </Text>
        </Box>
      )}
    </Box>
  );
};
