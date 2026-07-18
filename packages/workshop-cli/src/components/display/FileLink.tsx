import React from 'react';
import { Text } from 'ink';

interface FileLinkProps {
  /** Absolute path to the file */
  path: string;
  /** Line number (optional) */
  line?: number;
  /** Column number (optional) */
  column?: number;
  /** Display text (defaults to filename) */
  label?: string;
  /** Color of the link */
  color?: string;
}

/**
 * Build display text and vscode:// URL for a file path.
 * Handles Windows paths: backslash separators and drive letters
 * (vscode://file needs a leading slash: vscode://file/C:/...).
 */
function buildLink(path: string, line?: number, column?: number, label?: string): { displayText: string; url: string } {
  const filename = path.split(/[\\/]/).pop() || path;
  const displayText = label || (line ? `${filename}:${line}` : filename);

  const urlPath = path.replace(/\\/g, '/');
  let url = `vscode://file${urlPath.startsWith('/') ? '' : '/'}${urlPath}`;
  if (line) {
    url += `:${line}`;
    if (column) {
      url += `:${column}`;
    }
  }

  return { displayText, url };
}

/**
 * Clickable file link that opens in VS Code or JetBrains IDEs
 *
 * Uses OSC 8 hyperlinks (supported by most modern terminals):
 * - iTerm2, Hyper, Windows Terminal, Konsole, etc.
 * - VS Code integrated terminal
 * - JetBrains integrated terminal
 *
 * URL schemes:
 * - vscode://file/path:line:column
 * - idea://open?file=path&line=line (JetBrains)
 */
export const FileLink: React.FC<FileLinkProps> = ({
  path,
  line,
  column,
  label,
  color = 'blue',
}) => {
  const { displayText, url } = buildLink(path, line, column, label);

  // OSC 8 hyperlink escape sequences
  // Format: \x1b]8;;URL\x07TEXT\x1b]8;;\x07
  const linkStart = `\x1b]8;;${url}\x07`;
  const linkEnd = `\x1b]8;;\x07`;

  return (
    <Text color={color} underline>
      {linkStart}{displayText}{linkEnd}
    </Text>
  );
};

/**
 * Create a raw hyperlink string (for use outside React)
 */
export function createFileLink(
  path: string,
  line?: number,
  column?: number,
  label?: string
): string {
  const { displayText, url } = buildLink(path, line, column, label);
  return `\x1b]8;;${url}\x07${displayText}\x1b]8;;\x07`;
}
