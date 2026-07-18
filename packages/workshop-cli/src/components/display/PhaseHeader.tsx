import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';

interface PhaseHeaderProps {
  phase: number;
  title: string;
  showBigText?: boolean;
}

export const PhaseHeader: React.FC<PhaseHeaderProps> = ({
  phase,
  title,
  showBigText = false
}) => {
  return (
    <Box flexDirection="column" flexShrink={0}>
      {showBigText && (
        <Gradient name="morning">
          <BigText text={`PHASE ${phase}`} font="tiny" />
        </Gradient>
      )}
      <Box gap={1}>
        {!showBigText && (
          <Text backgroundColor="cyan" color="black" bold>{` PHASE ${phase} `}</Text>
        )}
        <Text bold color="cyan">
          📚 {title}
        </Text>
      </Box>
      <Box
        borderStyle="single"
        borderColor="cyan"
        borderBottom
        borderTop={false}
        borderLeft={false}
        borderRight={false}
      />
    </Box>
  );
};
