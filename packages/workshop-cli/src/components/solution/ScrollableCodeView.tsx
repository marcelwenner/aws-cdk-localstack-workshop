/**
 * ScrollableCodeView Component
 *
 * Shared scrollable view for code content (used by DiffViewer and FilePreview)
 *
 * Features:
 * - Scrollable with arrow keys (↑/↓ or j/k)
 * - Fixed height to prevent overflow
 * - Shows scroll position indicator
 * - Line numbers
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

export interface CodeLine {
  type: 'added' | 'removed' | 'context' | 'normal' | 'highlighted';
  content: string;
  lineNumber?: number;
}

export interface ScrollableCodeViewProps {
  /** Lines to display */
  lines: CodeLine[];
  /** Maximum visible lines */
  maxHeight?: number;
  /** Whether this component is active for input */
  isActive?: boolean;
  /** Show line numbers */
  showLineNumbers?: boolean;
  /** Key to reset scroll position (e.g., filePath) */
  resetKey?: string;
}

export const ScrollableCodeView: React.FC<ScrollableCodeViewProps> = ({
  lines,
  maxHeight = 15,
  isActive = true,
  showLineNumbers = false,
  resetKey,
}) => {
  const [scrollOffset, setScrollOffset] = useState(0);

  // Reset scroll when resetKey changes
  useEffect(() => {
    setScrollOffset(0);
  }, [resetKey]);

  const totalLines = lines.length;
  const canScroll = totalLines > maxHeight;
  const maxOffset = Math.max(0, totalLines - maxHeight);

  // Handle scrolling with arrow keys
  useInput((input, key) => {
    if (!isActive || !canScroll) return;

    if (key.upArrow || input === 'k') {
      setScrollOffset(prev => Math.max(0, prev - 1));
    } else if (key.downArrow || input === 'j') {
      setScrollOffset(prev => Math.min(maxOffset, prev + 1));
    } else if (key.pageUp) {
      setScrollOffset(prev => Math.max(0, prev - maxHeight));
    } else if (key.pageDown) {
      setScrollOffset(prev => Math.min(maxOffset, prev + maxHeight));
    }
  });

  // Get visible lines
  const visibleLines = lines.slice(scrollOffset, scrollOffset + maxHeight);

  // Calculate line number width for padding
  const lineNumWidth = showLineNumbers ? String(totalLines).length + 1 : 0;

  // Scroll indicator
  const scrollPercent = maxOffset > 0 ? Math.round((scrollOffset / maxOffset) * 100) : 0;

  return (
    <Box flexDirection="column" flexShrink={0}>
      {/* Scroll hint in header */}
      {canScroll && (
        <Box justifyContent="flex-end" marginBottom={0}>
          <Text dimColor>[↑↓] scroll ({scrollPercent}%)</Text>
        </Box>
      )}

      {/* Content box - fixed height */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        height={maxHeight + 2} // +2 for border
        overflow="hidden"
      >
        {/* Scroll up indicator */}
        {scrollOffset > 0 && (
          <Box flexShrink={0}>
            <Text dimColor>↑ {scrollOffset} more lines above</Text>
          </Box>
        )}

        {/* Visible lines */}
        {visibleLines.map((line, idx) => {
          const actualLineNum = scrollOffset + idx + 1;
          const key = `line-${actualLineNum}`;

          const lineNumText = showLineNumbers
            ? `${String(line.lineNumber ?? actualLineNum).padStart(lineNumWidth)} │ `
            : '';

          if (line.type === 'removed') {
            return (
              <Box key={key} flexShrink={0}>
                <Text color="red">
                  {lineNumText}- {line.content}
                </Text>
              </Box>
            );
          }
          if (line.type === 'added') {
            return (
              <Box key={key} flexShrink={0}>
                <Text color="green">
                  {lineNumText}+ {line.content}
                </Text>
              </Box>
            );
          }
          if (line.type === 'context') {
            return (
              <Box key={key} flexShrink={0}>
                <Text dimColor>
                  {lineNumText}  {line.content}
                </Text>
              </Box>
            );
          }
          if (line.type === 'highlighted') {
            // Pre-highlighted content from cli-highlight (contains ANSI codes)
            return (
              <Box key={key} flexShrink={0}>
                {showLineNumbers && <Text dimColor>{lineNumText}</Text>}
                <Text>{line.content}</Text>
              </Box>
            );
          }
          // normal
          return (
            <Box key={key} flexShrink={0}>
              <Text>
                {showLineNumbers && <Text dimColor>{lineNumText}</Text>}
                {line.content}
              </Text>
            </Box>
          );
        })}

        {/* Scroll down indicator */}
        {scrollOffset < maxOffset && (
          <Box flexShrink={0}>
            <Text dimColor>↓ {totalLines - scrollOffset - maxHeight} more lines below</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
