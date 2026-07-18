/**
 * SolutionPreviewScreen
 *
 * Main orchestrator for the solution preview → confirm → apply flow
 *
 * State Machine:
 * LISTING → PREVIEWING | DIFF_VIEW → CONFIRMING → APPLYING → SUCCESS
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { LoadingSpinner } from '../components/animations/LoadingSpinner.js';
import { SuccessMessage } from '../components/display/SuccessMessage.js';
import { SolutionFileList } from '../components/solution/SolutionFileList.js';
import { FilePreview } from '../components/solution/FilePreview.js';
import { DiffViewer } from '../components/solution/DiffViewer.js';
import { SolutionSummary } from '../components/solution/SolutionSummary.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { TerminalSizeWarning } from '../components/warnings/TerminalSizeWarning.js';
import {
  listSolutionFiles,
  readSolutionFile,
  readTargetFile,
  applySolution,
  getTargetPackageDir,
  hasBackup,
  restoreFromBackup,
  needsCdkChanges,
  type SolutionFile,
  type SolutionResult,
} from '../lib/file-operations.js';
import { getCdkStatus, type CdkError } from '../lib/cdk-operations.js';
import { runCdkDeploy, runPipeline } from '../lib/fast-deploy.js';
import { workshopConfig } from '../core/config/workshop.config.js';

export interface SolutionPreviewScreenProps {
  phase: number;
  onBack: () => void;
  onSuccess: () => void;
}

type ScreenState =
  | 'LOADING'
  | 'LISTING'
  | 'PREVIEWING'
  | 'DIFF_VIEW'
  | 'CONFIRMING'
  | 'APPLYING'
  | 'DEPLOYING'
  | 'SUCCESS'
  | 'ERROR'
  | 'RESTORING'
  | 'RESTORED';

export const SolutionPreviewScreen: React.FC<SolutionPreviewScreenProps> = ({
  phase,
  onBack,
  onSuccess,
}) => {
  const [state, setState] = useState<ScreenState>('LOADING');
  const [files, setFiles] = useState<SolutionFile[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [fileContent, setFileContent] = useState<string>('');
  const [oldFileContent, setOldFileContent] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [backupAvailable, setBackupAvailable] = useState(false);
  const [cdkNeeded, setCdkNeeded] = useState<{ needed: boolean; lambdaName?: string; reason?: string }>({ needed: false });
  const [solutionResult, setSolutionResult] = useState<SolutionResult | null>(null);
  const [deployStatus, setDeployStatus] = useState<string>('');

  // Check terminal size
  const terminalSize = useTerminalSize();

  // Height for diff viewer
  const diffViewerHeight = 18;

  // Load solution files on mount and check for backup + CDK status
  useEffect(() => {
    async function loadFiles() {
      try {
        const [solutionFiles, hasExistingBackup, cdkStatus] = await Promise.all([
          listSolutionFiles(phase),
          hasBackup(phase),
          needsCdkChanges(phase),
        ]);

        if (solutionFiles.length === 0) {
          setError(`Keine Lösungsdateien für Phase ${phase} gefunden`);
          setState('ERROR');
          return;
        }

        setFiles(solutionFiles);
        setBackupAvailable(hasExistingBackup);
        setCdkNeeded(cdkStatus);
        setState('LISTING');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(
          msg.includes('ENOENT')
            ? `Für Phase ${phase} gibt es keine Musterlösung - diese Phase ist zum Lesen bzw. Debuggen gedacht.`
            : msg
        );
        setState('ERROR');
      }
    }

    loadFiles();
  }, [phase]);

  // Load file content when previewing
  useEffect(() => {
    if (state === 'PREVIEWING' && files[currentFileIndex]) {
      async function loadContent() {
        try {
          const content = await readSolutionFile(phase, files[currentFileIndex].path);
          setFileContent(content);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setState('ERROR');
        }
      }

      loadContent();
    }
  }, [state, currentFileIndex, phase, files]);

  // Load both old and new content when in diff view
  useEffect(() => {
    if (state === 'DIFF_VIEW' && files[currentFileIndex]) {
      async function loadDiffContent() {
        try {
          const [oldContent, newContent] = await Promise.all([
            readTargetFile(phase, files[currentFileIndex].path),
            readSolutionFile(phase, files[currentFileIndex].path),
          ]);
          setOldFileContent(oldContent);
          setFileContent(newContent);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setState('ERROR');
        }
      }

      loadDiffContent();
    }
  }, [state, currentFileIndex, phase, files]);

  // Handle apply solution
  const handleApply = async () => {
    setState('APPLYING');

    try {
      const result = await applySolution(phase);
      setSolutionResult(result);
      setBackupAvailable(true); // Backup was created

      // Now deploy! CDK first if needed, then Lambda hot-reload
      setState('DEPLOYING');

      // Get package name for this phase
      const phaseConfig = workshopConfig.phases.find(p => p.id === phase);
      const watchPath = phaseConfig?.watchPaths[0] || '';
      const packageMatch = watchPath.match(/packages\/([^/]+)/);
      const packageName = packageMatch?.[1];

      if (result.cdkChanged) {
        // CDK was changed - need full CDK deploy
        setDeployStatus('CDK Deploy läuft...');
        const cdkResult = await runCdkDeploy();
        if (!cdkResult.success) {
          setError(`CDK Deploy fehlgeschlagen: ${cdkResult.error}`);
          setState('ERROR');
          return;
        }
      }

      // Hot-reload Lambda code if we have a package
      if (packageName) {
        setDeployStatus('Lambda wird aktualisiert...');
        const pipelineResult = await runPipeline(packageName);
        if (!pipelineResult.success) {
          // If hot-reload failed, try CDK deploy as fallback
          setDeployStatus('CDK Deploy (Fallback)...');
          const cdkResult = await runCdkDeploy();
          if (!cdkResult.success) {
            setError(`Deploy fehlgeschlagen: ${cdkResult.error}`);
            setState('ERROR');
            return;
          }
        }
      }

      setState('SUCCESS');

      // Go back after short delay
      setTimeout(() => {
        onBack();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('ERROR');
    }
  };

  // Handle restore from backup
  const handleRestore = async () => {
    setState('RESTORING');

    try {
      await restoreFromBackup(phase);
      setBackupAvailable(false); // Backup was consumed
      setState('RESTORED');

      // Go back after showing success
      setTimeout(() => {
        onBack();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('ERROR');
    }
  };

  // Compute derived state for hotkeys
  const isLastFile = currentFileIndex === files.length - 1;

  // Keyboard handling - must be before any early returns
  useInput((input, key) => {
    const k = input.toLowerCase();

    // ERROR state
    if (state === 'ERROR') {
      if (k === 'q' || key.escape) onBack();
      return;
    }

    // LISTING state
    if (state === 'LISTING') {
      if (k === 'd') {
        setCurrentFileIndex(0);
        setState('DIFF_VIEW');
      } else if (k === 'f') {
        setCurrentFileIndex(0);
        setState('PREVIEWING');
      } else if (k === 'a') {
        setState('CONFIRMING');
      } else if (k === 'r' && backupAvailable) {
        handleRestore();
      } else if (k === 'q' || key.escape) {
        onBack();
      }
      return;
    }

    // DIFF_VIEW state
    if (state === 'DIFF_VIEW') {
      if (k === 'w' && !isLastFile) {
        setCurrentFileIndex((prev) => prev + 1);
      } else if (k === 'f') {
        setState('PREVIEWING');
      } else if (k === 'a') {
        setState('CONFIRMING');
      } else if (k === 'l') {
        setState('LISTING');
      } else if (k === 'q' || key.escape) {
        onBack();
      }
      return;
    }

    // PREVIEWING state
    if (state === 'PREVIEWING') {
      if (k === 'w' && !isLastFile) {
        setCurrentFileIndex((prev) => prev + 1);
      } else if (k === 'd') {
        setState('DIFF_VIEW');
      } else if (k === 'a') {
        setState('CONFIRMING');
      } else if (k === 'l') {
        setState('LISTING');
      } else if (k === 'q' || key.escape) {
        onBack();
      }
      return;
    }

    // CONFIRMING state
    if (state === 'CONFIRMING') {
      if (k === 'j' || key.return) {
        handleApply();
      } else if (k === 'n' || key.escape) {
        setState('LISTING');
      }
      return;
    }
  });

  // Don't show hint anymore - uses valuable space

  // Horizontal footer component
  const HotkeyFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Box
      borderStyle="single"
      borderTop
      borderLeft={false}
      borderRight={false}
      borderBottom={false}
      borderColor="gray"
      gap={2}
      marginTop={1}
    >
      {children}
    </Box>
  );

  // Loading state
  if (state === 'LOADING') {
    return <LoadingSpinner message={`Lade Lösungsdateien für Phase ${phase}...`} />;
  }

  // Error state
  if (state === 'ERROR') {
    return (
      <Box flexDirection="column" width="100%" height="100%">
        <Box marginBottom={1}>
          <Text bold color="red">
            ❌ Fehler
          </Text>
        </Box>

        <Box marginBottom={2} borderStyle="round" borderColor="red" padding={1}>
          <Text>{error}</Text>
        </Box>

        <Box flexGrow={1} />

        <HotkeyFooter>
          <Text>
            <Text color="gray" bold>[ESC]</Text>
            <Text dimColor> Zurück</Text>
          </Text>
        </HotkeyFooter>
      </Box>
    );
  }

  // Listing files state
  if (state === 'LISTING') {
    return (
      <Box flexDirection="column" width="100%" height="100%">
        <SolutionFileList files={files} />

        {/* CDK Changes Info */}
        {cdkNeeded.needed && (
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="yellow"
            paddingX={1}
            marginY={1}
          >
            <Text bold color="yellow">🔧 CDK-Änderung wird mit angewendet:</Text>
            <Box marginTop={1} flexDirection="column">
              <Text>
                <Text color="cyan">{cdkNeeded.lambdaName}</Text>
                <Text dimColor> wird im CDK Stack aktiviert</Text>
              </Text>
              <Text dimColor>({cdkNeeded.reason})</Text>
            </Box>
            <Box marginTop={1}>
              <Text dimColor>
                Auto-Deploy startet automatisch nach dem Anwenden
              </Text>
            </Box>
          </Box>
        )}

        <Box flexGrow={1} />

        <HotkeyFooter>
          <Text>
            <Text color="cyan" bold>[d]</Text>
            <Text dimColor> Diff</Text>
          </Text>
          <Text>
            <Text color="cyan" bold>[f]</Text>
            <Text dimColor> Full</Text>
          </Text>
          <Text>
            <Text color="green" bold>[a]</Text>
            <Text dimColor> Anwenden</Text>
          </Text>
          {backupAvailable && (
            <Text>
              <Text color="yellow" bold>[r]</Text>
              <Text dimColor> Restore</Text>
            </Text>
          )}
          <Text>
            <Text color="gray" bold>[ESC]</Text>
            <Text dimColor> Zurück</Text>
          </Text>
        </HotkeyFooter>
      </Box>
    );
  }

  // Diff view state
  if (state === 'DIFF_VIEW') {
    const currentFile = files[currentFileIndex];

    // Show warning if terminal too small (need at least 40 rows for diff/preview)
    if (terminalSize.rows < 40) {
      return (
        <Box flexDirection="column" width="100%" height="100%">
          <TerminalSizeWarning
            currentSize={`${terminalSize.columns}x${terminalSize.rows}`}
            recommendedSize={terminalSize.recommendedSize}
            isNarrow={terminalSize.isNarrow}
            isShort={terminalSize.isShort}
          />
          <Box marginTop={1}>
            <Text dimColor>[l] zurück zur Liste | [ESC] Zurück</Text>
          </Box>
        </Box>
      );
    }

    return (
      <Box flexDirection="column" width="100%" height="100%">
        {/* File counter */}
        <Box marginBottom={1}>
          <Text dimColor>
            Datei {currentFileIndex + 1}/{files.length}
          </Text>
        </Box>

        <DiffViewer
          filePath={currentFile.path}
          oldContent={oldFileContent}
          newContent={fileContent}
          maxContextLines={3}
          maxHeight={diffViewerHeight}
        />

        <Box flexGrow={1} />

        <HotkeyFooter>
          {!isLastFile && (
            <Text>
              <Text color="yellow" bold>[w]</Text>
              <Text dimColor> Nächste</Text>
            </Text>
          )}
          <Text>
            <Text color="cyan" bold>[f]</Text>
            <Text dimColor> Full</Text>
          </Text>
          <Text>
            <Text color="green" bold>[a]</Text>
            <Text dimColor> Anwenden</Text>
          </Text>
          <Text>
            <Text color="gray" bold>[l]</Text>
            <Text dimColor> Liste</Text>
          </Text>
          <Text>
            <Text color="gray" bold>[ESC]</Text>
            <Text dimColor> Zurück</Text>
          </Text>
        </HotkeyFooter>
      </Box>
    );
  }

  // Previewing file state
  if (state === 'PREVIEWING') {
    const currentFile = files[currentFileIndex];

    // Show warning if terminal too small (need at least 40 rows for diff/preview)
    if (terminalSize.rows < 40) {
      return (
        <Box flexDirection="column" width="100%" height="100%">
          <TerminalSizeWarning
            currentSize={`${terminalSize.columns}x${terminalSize.rows}`}
            recommendedSize={terminalSize.recommendedSize}
            isNarrow={terminalSize.isNarrow}
            isShort={terminalSize.isShort}
          />
          <Box marginTop={1}>
            <Text dimColor>[l] zurück zur Liste | [ESC] Zurück</Text>
          </Box>
        </Box>
      );
    }

    return (
      <Box flexDirection="column" width="100%" height="100%">
        {/* File counter */}
        <Box marginBottom={1}>
          <Text dimColor>
            Datei {currentFileIndex + 1}/{files.length}
          </Text>
        </Box>

        <FilePreview
          filePath={currentFile.path}
          content={fileContent}
          maxHeight={diffViewerHeight}
        />

        <Box flexGrow={1} />

        <HotkeyFooter>
          {!isLastFile && (
            <Text>
              <Text color="yellow" bold>[w]</Text>
              <Text dimColor> Nächste</Text>
            </Text>
          )}
          <Text>
            <Text color="cyan" bold>[d]</Text>
            <Text dimColor> Diff</Text>
          </Text>
          <Text>
            <Text color="green" bold>[a]</Text>
            <Text dimColor> Anwenden</Text>
          </Text>
          <Text>
            <Text color="gray" bold>[l]</Text>
            <Text dimColor> Liste</Text>
          </Text>
          <Text>
            <Text color="gray" bold>[ESC]</Text>
            <Text dimColor> Zurück</Text>
          </Text>
        </HotkeyFooter>
      </Box>
    );
  }

  // Confirming state
  if (state === 'CONFIRMING') {
    const targetPackage = getTargetPackageDir(phase);

    return (
      <Box flexDirection="column" width="100%" height="100%">
        <SolutionSummary files={files} targetPackage={targetPackage} />

        {/* Time Machine Info */}
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="cyan"
          paddingX={1}
          marginY={1}
        >
          <Text bold color="cyan">
            💾 Time Machine
          </Text>
          <Box marginTop={1} flexDirection="column">
            <Text>Dein aktueller Code wird automatisch gesichert nach:</Text>
            <Text color="cyan" bold>
              {'  '}.workshop-state/backups/phase{phase}/
            </Text>
            <Box marginTop={1}>
              <Text dimColor>
                Du kannst jederzeit mit [r] im Datei-Menü zurückkehren.
              </Text>
            </Box>
          </Box>
        </Box>

        <Box flexGrow={1} />

        <Box flexDirection="column">
          <Text bold color="yellow">
            Lösung jetzt anwenden?
          </Text>
          <HotkeyFooter>
            <Text>
              <Text color="green" bold>[j]</Text>
              <Text dimColor> Ja, anwenden</Text>
            </Text>
            <Text>
              <Text color="red" bold>[n]</Text>
              <Text dimColor> Abbrechen</Text>
            </Text>
          </HotkeyFooter>
        </Box>
      </Box>
    );
  }

  // Applying state
  if (state === 'APPLYING') {
    return <LoadingSpinner message="Wende Lösung an..." />;
  }

  // Deploying state
  if (state === 'DEPLOYING') {
    return <LoadingSpinner message={deployStatus || 'Deploying...'} />;
  }

  // Success state
  if (state === 'SUCCESS') {
    const details = [
      `${solutionResult?.lambdaFiles.length || files.length} Dateien kopiert`,
      '💾 Backup erstellt in .workshop-state/backups/',
    ];

    // Add deploy info
    if (solutionResult?.cdkChanged) {
      details.push('🔧 CDK Stack aktualisiert');
    }
    details.push('✅ Lambda deployed');
    details.push('');
    details.push('→ Zurück zur Phase...');

    return (
      <Box flexDirection="column" marginY={2}>
        <SuccessMessage
          message="Lösung erfolgreich angewandt!"
          details={details}
        />
      </Box>
    );
  }

  // Restoring state
  if (state === 'RESTORING') {
    return <LoadingSpinner message="Stelle Original-Code wieder her..." />;
  }

  // Restored state
  if (state === 'RESTORED') {
    return (
      <Box flexDirection="column" marginY={2}>
        <SuccessMessage
          message="Original-Code wiederhergestellt!"
          details={[
            '⏪ Time Machine aktiviert',
            'Dein ursprünglicher Code ist zurück',
            '→ Zurück zum Menü...',
          ]}
        />
      </Box>
    );
  }

  return null;
};
