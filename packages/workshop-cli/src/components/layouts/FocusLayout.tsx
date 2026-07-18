/**
 * Focus Layout
 *
 * Fullscreen layout for tutorials and focused tasks
 * No sidebar, maximizes content area
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface FocusLayoutProps {
  children: React.ReactNode;
}

export const FocusLayout: React.FC<FocusLayoutProps> = ({ children }) => {
  return (
    <Box flexDirection="column" width="100%" height="100%">
      {children}
    </Box>
  );
};
