import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { QuizResult } from '../core/state/workshop-state.js';

export interface QuizResultsScreenProps {
  result: QuizResult;
  phase: number;
  onContinue: () => void;
}

/**
 * Quiz results summary screen
 * Always allows user to proceed (non-blocking)
 */
export const QuizResultsScreen: React.FC<QuizResultsScreenProps> = ({
  result,
  phase,
  onContinue
}) => {
  useInput((input, key) => {
    if (key.return || input === ' ') {
      onContinue();
    }
  });

  const getScoreColor = () => {
    if (result.score >= 80) return 'green';
    if (result.score >= 60) return 'yellow';
    return 'red';
  };

  const getScoreMessage = () => {
    if (result.score >= 80) return 'Ausgezeichnet!';
    if (result.score >= 60) return 'Gut gemacht!';
    return 'Weiter üben!';
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <Box flexDirection="column" width="100%" height="100%" alignItems="center" overflow="hidden">
      {/* Score display - compact */}
      <Box
        flexDirection="column"
        alignItems="center"
        borderStyle="double"
        borderColor={getScoreColor()}
        paddingX={2}
        paddingY={1}
        marginY={1}
      >
        <Text bold>QUIZ ABGESCHLOSSEN</Text>
        <Text bold color={getScoreColor()}>{result.score}%</Text>
        <Text>{result.correctAnswers} von {result.totalQuestions} richtig</Text>
        <Text dimColor>Zeit: {formatTime(result.timeSpent)}</Text>
      </Box>

      {/* Motivational message */}
      <Box marginBottom={1}>
        <Text bold color={getScoreColor()}>
          {getScoreMessage()}
        </Text>
      </Box>

      {/* Per-question breakdown - inline */}
      <Box flexDirection="row" gap={2} marginBottom={1}>
        {result.answers.map((answer, idx) => (
          <Text key={answer.questionId} color={answer.correct ? 'green' : 'red'}>
            {answer.correct ? '✓' : '✗'} Frage {idx + 1}
          </Text>
        ))}
      </Box>

      {/* Continue hint */}
      <Box marginTop={1}>
        <Text color="cyan" bold>[Enter]</Text>
        <Text> Weiter zu Phase {phase + 1}</Text>
      </Box>
    </Box>
  );
};
