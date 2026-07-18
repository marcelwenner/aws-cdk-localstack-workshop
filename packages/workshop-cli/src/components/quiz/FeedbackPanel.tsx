import React from 'react';
import { Box, Text } from 'ink';

export interface FeedbackPanelProps {
  correct: boolean;
  explanation?: string;  // Shown for wrong answers
  praise?: string;       // Shown for correct answers
  onContinue?: () => void;  // Only for wrong answers (requires button press)
}

/**
 * Shows feedback after answering a question
 * - Correct: Brief praise, auto-advances after 1.5s
 * - Wrong: Detailed explanation, requires manual "Weiter"
 */
export const FeedbackPanel: React.FC<FeedbackPanelProps> = ({
  correct,
  explanation,
  praise,
  onContinue
}) => {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={correct ? 'green' : 'red'}
      padding={1}
      marginY={1}
    >
      <Box marginBottom={1}>
        <Text bold color={correct ? 'green' : 'red'}>
          {correct ? '✅ Richtig!' : '❌ Leider falsch.'}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>
          {correct
            ? (praise || 'Sehr gut!')
            : explanation}
        </Text>
      </Box>

      {!correct && onContinue && (
        <Box>
          <Text dimColor>Drücke Enter um fortzufahren...</Text>
        </Box>
      )}
    </Box>
  );
};
