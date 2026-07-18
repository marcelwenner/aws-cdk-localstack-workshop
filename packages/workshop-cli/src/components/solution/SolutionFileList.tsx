/**
 * SolutionFileList Component
 *
 * Displays a tree view of solution files that will be applied
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { SolutionFile } from '../../lib/file-operations.js';

export interface SolutionFileListProps {
  files: SolutionFile[];
  selectedFile?: string;
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
 * Group files by directory for tree view
 */
function groupByDirectory(files: SolutionFile[]): Map<string, SolutionFile[]> {
  const groups = new Map<string, SolutionFile[]>();

  for (const file of files) {
    const dir = file.path.includes('/') ? file.path.split('/')[0] : '.';
    if (!groups.has(dir)) {
      groups.set(dir, []);
    }
    groups.get(dir)!.push(file);
  }

  return groups;
}

export const SolutionFileList: React.FC<SolutionFileListProps> = ({
  files,
  selectedFile,
}) => {
  const groups = groupByDirectory(files);

  return (
    <Box flexDirection="column" marginY={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="yellow">
          📁 Dateien die angewendet werden ({files.length} Dateien):
        </Text>
      </Box>

      {/* File tree */}
      <Box flexDirection="column" borderStyle="round" borderColor="gray" padding={1}>
        {Array.from(groups.entries()).map(([dir, dirFiles]) => (
          <Box key={dir} flexDirection="column">
            {/* Directory header */}
            <Box>
              <Text color="cyan" bold>
                ▸ {dir}/
              </Text>
            </Box>

            {/* Files in directory */}
            {dirFiles.map((file) => {
              const fileName = file.path.split('/').pop() || file.path;
              const isSelected = file.path === selectedFile;

              return (
                <Box key={file.path} marginLeft={2}>
                  <Text color={isSelected ? 'green' : 'white'} bold={isSelected}>
                    {isSelected ? '→ ' : '  '}
                    └─ {fileName}
                  </Text>
                  <Text dimColor> ({formatSize(file.size)})</Text>
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>

      {/* Summary */}
      <Box marginTop={1}>
        <Text dimColor>
          Gesamtgröße: {formatSize(files.reduce((sum, f) => sum + f.size, 0))}
        </Text>
      </Box>
    </Box>
  );
};
