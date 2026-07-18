import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { PhaseTutorial } from '../lib/tutorials/tutorial.types.js';
import { SelectPrompt } from '../components/prompts/SelectPrompt.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

interface PhaseTutorialScreenProps {
  tutorial: PhaseTutorial;
  onBack: () => void;
}

// Minimum terminal height for tutorials (rows)
const MIN_HEIGHT = 30;

type TutorialState = 'sections' | 'completed' | 'hints';

export const PhaseTutorialScreen: React.FC<PhaseTutorialScreenProps> = ({
  tutorial,
  onBack,
}) => {
  const [section, setSection] = useState(0);
  const [tutorialState, setTutorialState] = useState<TutorialState>('sections');
  const [hintLevel, setHintLevel] = useState(0);
  const [dismissedWarning, setDismissedWarning] = useState(false);
  const terminalSize = useTerminalSize();

  const isTooSmall = terminalSize.rows < MIN_HEIGHT;
  const isInWarningScreen = isTooSmall && !dismissedWarning;

  // Keyboard shortcuts for tutorial navigation
  useInput((input, key) => {
    // Don't handle input if warning screen is shown
    if (isInWarningScreen) return;

    const lowerInput = input.toLowerCase();

    if (tutorialState === 'sections') {
      // Section navigation
      if (lowerInput === 'w' || key.rightArrow) {
        // Weiter
        if (section < tutorial.sections.length - 1) {
          setSection(s => s + 1);
        } else {
          // Last section -> show completion screen
          setTutorialState('completed');
        }
      }
      if (lowerInput === 'z' || key.leftArrow) {
        // Zurück
        if (section > 0) {
          setSection(s => s - 1);
        }
      }
      if (lowerInput === 'q' || key.escape) {
        onBack();
      }
    } else if (tutorialState === 'completed') {
      // Completion screen
      if (key.return) {
        // Enter -> back to phase
        onBack();
      }
      if (lowerInput === 'h') {
        // Show hints
        setTutorialState('hints');
      }
    } else if (tutorialState === 'hints') {
      // Hints navigation
      if (lowerInput === 'w' || key.rightArrow) {
        // Nächster Hint
        if (hintLevel < tutorial.hints.length - 1) {
          setHintLevel(l => l + 1);
        }
      }
      if (lowerInput === 'z' || key.leftArrow) {
        // Vorheriger Hint oder zurück zur Completion
        if (hintLevel > 0) {
          setHintLevel(l => l - 1);
        } else {
          setTutorialState('completed');
        }
      }
      if (lowerInput === 'q' || key.escape) {
        onBack();
      }
    }
  });

  // Terminal too small warning
  if (isInWarningScreen) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="yellow" padding={1} flexDirection="column">
          <Text bold color="yellow">⚠️  Terminal zu klein für Tutorials</Text>
          <Box marginY={1} flexDirection="column">
            <Text>Aktuell: <Text bold color="red">{terminalSize.rows}</Text> Zeilen</Text>
            <Text>Minimum: <Text bold color="green">{MIN_HEIGHT}</Text> Zeilen</Text>
          </Box>
          <Text dimColor>Diagramme werden sonst abgeschnitten.</Text>
        </Box>
        <Box marginTop={1}>
          <SelectPrompt
            message=""
            choices={[
              { label: 'Trotzdem fortfahren', value: 'continue' },
              { label: 'Zurück', value: 'back' }
            ]}
            onSelect={(v) => {
              if (v === 'continue') setDismissedWarning(true);
              if (v === 'back') onBack();
            }}
          />
        </Box>
      </Box>
    );
  }

  // Section Navigation
  if (tutorialState === 'sections') {
    const currentSection = tutorial.sections[section];
    const totalSections = tutorial.sections.length;
    const isLastSection = section === totalSections - 1;
    const isFirstSection = section === 0;

    return (
      <Box flexDirection="column" width="100%" height="100%">
        {/* Size warning bar */}
        {isTooSmall && dismissedWarning && (
          <Box backgroundColor="yellow" paddingX={1} flexShrink={0}>
            <Text color="black" bold>⚠️ Terminal zu klein ({terminalSize.rows}/{MIN_HEIGHT})</Text>
          </Box>
        )}

        {/* HEADER */}
        <Box
          justifyContent="space-between"
          marginBottom={1}
          borderStyle="single"
          borderTop={false}
          borderLeft={false}
          borderRight={false}
          borderColor="gray"
          flexShrink={0}
        >
          <Text bold color="blue">🎓 {tutorial.title}</Text>
          <Box>
            {tutorial.sections.map((sec, i) => (
              <Text key={`section-dot-${sec.title}`} color={i === section ? 'cyan' : 'gray'}>
                {i === section ? ' ● ' : ' ○ '}
              </Text>
            ))}
          </Box>
        </Box>

        {/* BODY - Content Area */}
        <Box flexGrow={1} flexDirection="column">
          <Box marginBottom={1} flexShrink={0}>
            <Text bold underline color="magenta">
              {currentSection.title}
            </Text>
          </Box>

          {/* Content */}
          <Box flexDirection="column" flexGrow={1} paddingRight={1}>
            {/* Architecture diagram for first section */}
            {section === 0 && tutorial.architecture && (
              <Box flexDirection="column" marginBottom={1} flexShrink={0}>
                <Text bold color="cyan">🏗️ Architektur:</Text>
                <Box borderStyle="single" borderColor="cyan" padding={1} marginY={1} flexShrink={0}>
                  <Text dimColor>{tutorial.architecture}</Text>
                </Box>
              </Box>
            )}
            {/* Section content */}
            <Box flexDirection="column" flexShrink={0}>
              {currentSection.content}
            </Box>
          </Box>
        </Box>

        {/* FOOTER - Hotkeys */}
        <Box
          borderStyle="single"
          borderTop
          borderLeft={false}
          borderRight={false}
          borderBottom={false}
          borderColor="gray"
          flexShrink={0}
          paddingY={0}
          gap={2}
        >
          <Text>
            <Text color="cyan" bold>[w]</Text>
            <Text dimColor>{isLastSection ? ' Fertig' : ' Weiter'}</Text>
          </Text>
          {!isFirstSection && (
            <Text>
              <Text color="cyan" bold>[z]</Text>
              <Text dimColor> Zurück</Text>
            </Text>
          )}
          <Text>
            <Text color="gray" bold>[ESC]</Text>
            <Text dimColor> Tutorial beenden</Text>
          </Text>
          <Box flexGrow={1} />
          <Text dimColor>
            {section + 1}/{totalSections}
          </Text>
        </Box>
      </Box>
    );
  }

  // Completion Screen
  if (tutorialState === 'completed') {
    return (
      <Box flexDirection="column" width="100%" height="100%">
        {/* Size warning bar */}
        {isTooSmall && dismissedWarning && (
          <Box backgroundColor="yellow" paddingX={1} flexShrink={0}>
            <Text color="black" bold>⚠️ Terminal zu klein ({terminalSize.rows}/{MIN_HEIGHT})</Text>
          </Box>
        )}

        <Box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center">
          <Box flexDirection="column" alignItems="center" borderStyle="double" borderColor="green" padding={2} paddingX={4}>
            <Text color="green" bold>✓ Tutorial abgeschlossen</Text>
            <Box marginY={1}>
              <Text bold color="blue">{tutorial.title}</Text>
            </Box>
            <Box flexDirection="column" alignItems="center" marginTop={1}>
              <Text dimColor>{tutorial.sections.length} Sections durchgearbeitet</Text>
            </Box>
          </Box>

          <Box marginTop={2} flexDirection="column" alignItems="center">
            <Text color="cyan">Drücke <Text bold color="white">Enter</Text> um zur Phase zurückzukehren</Text>
            {tutorial.hints.length > 0 && (
              <Box marginTop={1}>
                <Text dimColor>
                  oder <Text bold>[h]</Text> für {tutorial.hints.length} Hints
                </Text>
              </Box>
            )}
          </Box>
        </Box>

        {/* FOOTER */}
        <Box
          borderStyle="single"
          borderTop
          borderLeft={false}
          borderRight={false}
          borderBottom={false}
          borderColor="gray"
          flexShrink={0}
          paddingY={0}
          gap={2}
        >
          <Text>
            <Text color="green" bold>[Enter]</Text>
            <Text dimColor> Tutorial beenden</Text>
          </Text>
          {tutorial.hints.length > 0 && (
            <Text>
              <Text color="yellow" bold>[h]</Text>
              <Text dimColor> Hints</Text>
            </Text>
          )}
        </Box>
      </Box>
    );
  }

  // Hints Section
  if (tutorialState === 'hints') {
    const currentHint = tutorial.hints[hintLevel];
    const isLastHint = hintLevel === tutorial.hints.length - 1;
    const isFirstHint = hintLevel === 0;

    return (
      <Box flexDirection="column" width="100%" height="100%">
        {/* Size warning bar */}
        {isTooSmall && dismissedWarning && (
          <Box backgroundColor="yellow" paddingX={1} flexShrink={0}>
            <Text color="black" bold>⚠️ Terminal zu klein ({terminalSize.rows}/{MIN_HEIGHT})</Text>
          </Box>
        )}

        {/* HEADER */}
        <Box
          justifyContent="space-between"
          marginBottom={1}
          borderStyle="single"
          borderTop={false}
          borderLeft={false}
          borderRight={false}
          borderColor="yellow"
          flexShrink={0}
        >
          <Text bold color="yellow">💡 {tutorial.title} - Hints</Text>
          <Box>
            {tutorial.hints.map((hint, i) => (
              <Text key={`hint-dot-${hint.title}`} color={i === hintLevel ? 'yellow' : 'gray'}>
                {i === hintLevel ? ' ● ' : ' ○ '}
              </Text>
            ))}
          </Box>
        </Box>

        {/* BODY */}
        <Box flexGrow={1} flexDirection="column">
          <Box marginBottom={1} flexShrink={0}>
            <Text bold underline color="yellow">
              Hint {hintLevel + 1}: {currentHint.title}
            </Text>
          </Box>

          <Box flexDirection="column" flexGrow={1}>
            <Text>{currentHint.content}</Text>
          </Box>
        </Box>

        {/* FOOTER - Hotkeys */}
        <Box
          borderStyle="single"
          borderTop
          borderLeft={false}
          borderRight={false}
          borderBottom={false}
          borderColor="gray"
          flexShrink={0}
          paddingY={0}
          gap={2}
        >
          {!isLastHint && (
            <Text>
              <Text color="yellow" bold>[w]</Text>
              <Text dimColor> Weiter</Text>
            </Text>
          )}
          <Text>
            <Text color="cyan" bold>[z]</Text>
            <Text dimColor>{isFirstHint ? ' Zurück' : ' Vorheriger'}</Text>
          </Text>
          <Text>
            <Text color="gray" bold>[ESC]</Text>
            <Text dimColor> Phase</Text>
          </Text>
          <Box flexGrow={1} />
          <Text dimColor>
            {hintLevel + 1}/{tutorial.hints.length}
          </Text>
        </Box>
      </Box>
    );
  }

  return null;
};
