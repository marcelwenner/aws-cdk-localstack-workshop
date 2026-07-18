import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TutorialHint } from '../../lib/tutorials/tutorial.types.js';

interface ProgressiveHintViewerProps {
  hints: TutorialHint[];
  initialIndex: number;
  onProgressChange: (index: number) => void;
  onAllHintsSeen: () => void;
  onBack: () => void;
}

type ViewerState = 'viewing' | 'completed';

export const ProgressiveHintViewer: React.FC<ProgressiveHintViewerProps> = ({
  hints,
  initialIndex,
  onProgressChange,
  onAllHintsSeen,
  onBack,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [viewerState, setViewerState] = useState<ViewerState>(
    initialIndex >= hints.length ? 'completed' : 'viewing'
  );

  const isLastHint = currentIndex >= hints.length - 1;
  const isFirstHint = currentIndex === 0;
  const currentHint = hints[currentIndex];

  useInput((input, key) => {
    const lowerInput = input.toLowerCase();

    if (viewerState === 'viewing') {
      // Next hint
      if (lowerInput === 'w' || key.rightArrow) {
        if (isLastHint) {
          // All hints seen - show completion screen
          setViewerState('completed');
          onProgressChange(hints.length); // Mark as fully viewed
        } else {
          const newIndex = currentIndex + 1;
          setCurrentIndex(newIndex);
          onProgressChange(newIndex);
        }
      }

      // Previous hint
      if (lowerInput === 'z' || key.leftArrow) {
        if (!isFirstHint) {
          const newIndex = currentIndex - 1;
          setCurrentIndex(newIndex);
          onProgressChange(newIndex);
        }
      }

      // Back to menu
      if (lowerInput === 'q' || key.escape) {
        onBack();
      }
    } else if (viewerState === 'completed') {
      // Completion screen hotkeys
      if (lowerInput === 'q' || key.escape) {
        onBack(); // User wants to implement themselves
      }
      if (lowerInput === 'l') {
        onAllHintsSeen(); // User wants to see/apply solution
      }
    }
  });

  // Completion Screen
  if (viewerState === 'completed') {
    return (
      <Box flexDirection="column" width="100%" height="100%">
        {/* Header */}
        <Box
          borderStyle="single"
          borderTop={false}
          borderLeft={false}
          borderRight={false}
          borderColor="green"
          marginBottom={1}
        >
          <Text bold color="green">Alle Hints gesehen!</Text>
        </Box>

        {/* Content */}
        <Box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center">
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="green"
            padding={2}
            paddingX={4}
          >
            <Text bold color="green">Du hast alle {hints.length} Hints gesehen</Text>
            <Box marginTop={1} flexDirection="column">
              <Text>Wie möchtest du fortfahren?</Text>
            </Box>
            <Box marginTop={2} flexDirection="column">
              <Text>
                <Text bold color="cyan">[ESC]</Text>
                <Text> Selbst implementieren</Text>
              </Text>
              <Text>
                <Text bold color="magenta">[l]</Text>
                <Text> Lösung anzeigen & übernehmen</Text>
              </Text>
            </Box>
          </Box>
        </Box>

        {/* Footer */}
        <Box
          borderStyle="single"
          borderTop
          borderLeft={false}
          borderRight={false}
          borderBottom={false}
          borderColor="gray"
          gap={2}
        >
          <Text>
            <Text color="cyan" bold>[ESC]</Text>
            <Text dimColor> Selbst coden</Text>
          </Text>
          <Text>
            <Text color="magenta" bold>[l]</Text>
            <Text dimColor> Lösung</Text>
          </Text>
        </Box>
      </Box>
    );
  }

  // Hint Viewing Screen
  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <Box
        justifyContent="space-between"
        borderStyle="single"
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderColor="yellow"
      >
        <Text bold color="yellow">
          Hint {currentIndex + 1}/{hints.length}: {currentHint?.title || 'Hint'}
        </Text>
        <Box>
          {hints.map((hint, i) => (
            <Text key={`hint-progress-${hint.title}`} color={i === currentIndex ? 'yellow' : i < currentIndex ? 'green' : 'gray'}>
              {i <= currentIndex ? ' ● ' : ' ○ '}
            </Text>
          ))}
        </Box>
      </Box>

      {/* Content */}
      <Box flexGrow={1} flexDirection="column" padding={1}>
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="yellow"
          padding={1}
          flexShrink={0}
        >
          <Text>{currentHint?.content || ''}</Text>
        </Box>
      </Box>

      {/* Footer */}
      <Box
        borderStyle="single"
        borderTop
        borderLeft={false}
        borderRight={false}
        borderBottom={false}
        borderColor="gray"
        gap={2}
      >
        <Text>
          <Text color="yellow" bold>[w]</Text>
          <Text dimColor>{isLastHint ? ' Fertig' : ' Nächster'}</Text>
        </Text>
        {!isFirstHint && (
          <Text>
            <Text color="yellow" bold>[z]</Text>
            <Text dimColor> Zurück</Text>
          </Text>
        )}
        <Text>
          <Text color="gray" bold>[ESC]</Text>
          <Text dimColor> Menü</Text>
        </Text>
        <Box flexGrow={1} />
        <Text dimColor>
          {currentIndex + 1}/{hints.length}
        </Text>
      </Box>
    </Box>
  );
};
