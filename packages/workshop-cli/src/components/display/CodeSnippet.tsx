import React from 'react';
import { Box, Text } from 'ink';
import { highlight } from 'cli-highlight';

export interface CodeSnippetProps {
  code: string;
  language?: 'typescript' | 'javascript' | 'bash' | 'json' | 'sql';
  title?: string;
  showLineNumbers?: boolean;
}

/**
 * Code snippet component with syntax highlighting using cli-highlight
 * Displays code in a professional VS Code-like format
 */
export const CodeSnippet: React.FC<CodeSnippetProps> = ({
  code,
  language = 'typescript',
  title,
  showLineNumbers = true
}) => {
  const highlighted = highlight(code.trim(), {
    language
  });

  const lines = highlighted.split('\n');

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" padding={1} marginY={1} flexShrink={0}>
      {title && (
        <Box marginBottom={1}>
          <Text bold color="blue">📄 {title}</Text>
        </Box>
      )}
      <Box flexDirection="column">
        {lines.map((line, idx) => (
          <Box key={`line-${idx}`}>
            {showLineNumbers && (
              <Text color="gray" dimColor>{String(idx + 1).padStart(3, ' ')} │ </Text>
            )}
            <Text>{line}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
};
