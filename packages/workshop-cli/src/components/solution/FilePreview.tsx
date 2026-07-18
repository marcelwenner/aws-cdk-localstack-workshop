/**
 * FilePreview Component
 *
 * Shows a single file's content with scrolling support and syntax highlighting
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { highlight } from 'cli-highlight';
import { ScrollableCodeView, type CodeLine } from './ScrollableCodeView.js';

export interface FilePreviewProps {
  filePath: string;
  content: string;
  language?: 'typescript' | 'javascript' | 'json';
  /** Maximum visible lines */
  maxHeight?: number;
  /** Whether this component is active for input */
  isActive?: boolean;
}

/**
 * Format file size in human-readable format
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Detect language from file path
 */
function detectLanguage(filePath: string): string {
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript';
  if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) return 'javascript';
  if (filePath.endsWith('.json')) return 'json';
  return 'typescript'; // default
}

export const FilePreview: React.FC<FilePreviewProps> = ({
  filePath,
  content,
  language,
  maxHeight = 15,
  isActive = true,
}) => {
  const detectedLanguage = language ?? detectLanguage(filePath);

  const lines = useMemo((): CodeLine[] => {
    // Apply syntax highlighting to entire content
    const highlighted = highlight(content, { language: detectedLanguage });
    return highlighted.split('\n').map((line, idx) => ({
      type: 'highlighted' as const,
      content: line,
      lineNumber: idx + 1,
    }));
  }, [content, detectedLanguage]);

  const lineCount = lines.length;
  const byteSize = Buffer.byteLength(content, 'utf-8');

  return (
    <Box flexDirection="column" marginY={1} flexShrink={0}>
      {/* File header */}
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="cyan">📄 {filePath}</Text>
        <Text dimColor>{lineCount} Zeilen · {formatSize(byteSize)}</Text>
      </Box>

      {/* Scrollable file content */}
      <ScrollableCodeView
        lines={lines}
        maxHeight={maxHeight}
        isActive={isActive}
        showLineNumbers={true}
        resetKey={filePath}
      />
    </Box>
  );
};
