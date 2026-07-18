import React from 'react';
import { Box, Text } from 'ink';

export interface QuizHeaderProps {
  phaseTitle: string;
  currentQuestion: number;
  totalQuestions: number;
  timeRemaining: number;  // seconds
}

/**
 * Quiz header showing progress and timer
 * Maintains visual consistency with dashboard design
 */
export const QuizHeader: React.FC<QuizHeaderProps> = ({
  phaseTitle,
  currentQuestion,
  totalQuestions,
  timeRemaining
}) => {
  const getTimerColor = () => {
    if (timeRemaining > 60) return 'green';
    if (timeRemaining > 30) return 'yellow';
    return 'red';
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Box
      borderStyle="single"
      borderLeft={false}
      borderRight={false}
      borderTop={false}
      borderColor="gray"
      justifyContent="space-between"
      paddingX={2}
      marginBottom={1}
    >
      <Box>
        <Text bold color="magenta">QUIZ: {phaseTitle}</Text>
      </Box>
      <Box>
        <Text dimColor>Frage {currentQuestion}/{totalQuestions}</Text>
        <Text color="gray"> │ </Text>
        <Text color={getTimerColor()}>⏱ {formatTime(timeRemaining)}</Text>
      </Box>
    </Box>
  );
};
