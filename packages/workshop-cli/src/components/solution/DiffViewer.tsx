/**
 * DiffViewer Component
 *
 * Shows interactive diff with red/green highlighting (like git diff)
 * Uses shared ScrollableCodeView for consistent scrolling behavior
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { diffLines, type Change } from 'diff';
import { ScrollableCodeView, type CodeLine } from './ScrollableCodeView.js';

export interface DiffViewerProps {
  filePath: string;
  oldContent: string;
  newContent: string;
  maxContextLines?: number;
  /** Maximum visible lines (default: 15) */
  maxHeight?: number;
  /** Whether this component is active for input */
  isActive?: boolean;
}

/**
 * Convert diff changes to flat line array for easier scrolling
 */
function flattenDiffToLines(changes: Change[], contextLines: number): CodeLine[] {
  const lines: CodeLine[] = [];
  let inChange = false;
  let contextCount = 0;
  let lineBuffer: CodeLine[] = [];

  for (const change of changes) {
    const changeLines = change.value.split('\n').filter((_, i, arr) =>
      !(i === arr.length - 1 && arr[i] === '')
    );

    if (change.added || change.removed) {
      // Flush context buffer (up to contextLines before change)
      if (!inChange && lineBuffer.length > 0) {
        const contextBefore = lineBuffer.slice(-contextLines);
        lines.push(...contextBefore);
      }
      lineBuffer = [];
      inChange = true;
      contextCount = 0;

      for (const line of changeLines) {
        lines.push({
          type: change.added ? 'added' : 'removed',
          content: line,
        });
      }
    } else {
      // Context line
      if (inChange) {
        // Context after change
        for (const line of changeLines) {
          if (contextCount < contextLines) {
            lines.push({ type: 'context', content: line });
            contextCount++;
          } else {
            lineBuffer.push({ type: 'context', content: line });
          }
        }
        if (contextCount >= contextLines) {
          inChange = false;
        }
      } else {
        // Buffer context lines (for "before" context)
        for (const line of changeLines) {
          lineBuffer.push({ type: 'context', content: line });
        }
      }
    }
  }

  return lines;
}

/**
 * Count total additions across all changes
 */
function countAdditions(changes: Change[]): number {
  return changes
    .filter(c => c.added)
    .reduce((sum, c) => sum + (c.count || 0), 0);
}

/**
 * Count total deletions across all changes
 */
function countDeletions(changes: Change[]): number {
  return changes
    .filter(c => c.removed)
    .reduce((sum, c) => sum + (c.count || 0), 0);
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  filePath,
  oldContent,
  newContent,
  maxContextLines = 3,
  maxHeight = 15,
  isActive = true,
}) => {
  const changes = useMemo(() => diffLines(oldContent, newContent), [oldContent, newContent]);
  const diffLines_ = useMemo(
    () => flattenDiffToLines(changes, maxContextLines),
    [changes, maxContextLines]
  );

  // If no changes, show message
  if (changes.length === 0 || changes.every(c => !c.added && !c.removed)) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">📝 {filePath}</Text>
        </Box>
        <Box borderStyle="single" borderColor="gray" padding={1}>
          <Text dimColor>No changes (file is identical)</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1} flexShrink={0}>
      {/* File header */}
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="cyan">📝 {filePath}</Text>
        <Text>
          <Text color="green" bold>+{countAdditions(changes)}</Text>
          <Text dimColor> / </Text>
          <Text color="red" bold>-{countDeletions(changes)}</Text>
        </Text>
      </Box>

      {/* Scrollable diff content */}
      <ScrollableCodeView
        lines={diffLines_}
        maxHeight={maxHeight}
        isActive={isActive}
        showLineNumbers={false}
        resetKey={`${filePath}-${oldContent.length}-${newContent.length}`}
      />

      {/* Legend */}
      <Box marginTop={1}>
        <Text dimColor>💡 </Text>
        <Text color="green">+ added</Text>
        <Text dimColor> / </Text>
        <Text color="red">- removed</Text>
      </Box>
    </Box>
  );
};
