import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

export interface DlqIndicatorProps {
  /** Number of messages in DLQ */
  depth: number;
  /** Animation speed for blinking */
  animationSpeed?: number;
  /** Compact mode (single line) */
  compact?: boolean;
}

/**
 * DlqIndicator - Dead Letter Queue visualization with alert animation
 *
 * Features:
 * - Blinks red when depth > 0
 * - Shows skull icon with count
 * - Urgency increases with count
 */
export const DlqIndicator: React.FC<DlqIndicatorProps> = ({
  depth,
  animationSpeed = 500,
  compact = false,
}) => {
  const [blink, setBlink] = useState(false);

  // Blink animation when there are messages
  useEffect(() => {
    if (depth === 0) {
      setBlink(false);
      return;
    }

    // Blink faster with more messages
    const speed = depth >= 5 ? animationSpeed / 2 : animationSpeed;

    const interval = setInterval(() => {
      setBlink(b => !b);
    }, speed);

    return () => clearInterval(interval);
  }, [depth, animationSpeed]);

  const hasMessages = depth > 0;
  const borderColor = hasMessages ? (blink ? 'red' : 'yellow') : 'gray';
  const textColor = hasMessages ? (blink ? 'red' : 'yellow') : 'gray';

  if (compact) {
    return (
      <Box gap={1}>
        <Text color={textColor} bold={hasMessages}>
          ✗
        </Text>
        <Text color={textColor} bold={hasMessages}>
          {depth}
        </Text>
        {hasMessages && blink && (
          <Text color="red">!</Text>
        )}
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      borderStyle={hasMessages ? 'double' : 'single'}
      borderColor={borderColor}
      paddingX={1}
      width={11}
    >
      <Text color={textColor} bold>DLQ</Text>
      <Text color={textColor}>
        ✗ {depth}
      </Text>
      {hasMessages && depth >= 3 && (
        <Text color="red" dimColor={!blink}>
          ALERT
        </Text>
      )}
    </Box>
  );
};

export default DlqIndicator;
