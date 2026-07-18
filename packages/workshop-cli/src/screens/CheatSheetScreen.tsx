/**
 * CheatSheetScreen - Quick Reference Overlay
 *
 * Displays code snippets and shortcuts organized by category.
 * Navigate with arrow keys, close with ?/q/Esc.
 */

import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { highlight } from 'cli-highlight';
import {
  CHEAT_SHEET_DATA,
  type CheatSheetCategory,
  type CheatSheetSnippet,
} from '../core/config/cheat-sheet.js';
import { useTerminalDimensions } from '../hooks/useTerminalDimensions.js';

/**
 * Geschätzte Zeilenhöhe eines Snippets (inkl. marginBottom).
 * Lange Beschreibungen wrappen - das muss in die Schätzung, sonst
 * wird unten wieder stumm geclippt.
 */
function estimateSnippetLines(snippet: CheatSheetSnippet, width: number): number {
  const textWidth = Math.max(20, width - 8);
  let lines = 1; // title
  if (snippet.description) lines += Math.ceil(snippet.description.length / textWidth);
  if (snippet.code) lines += snippet.code.trim().split('\n').length + 2; // + margins
  if (snippet.tip) lines += Math.ceil((snippet.tip.length + 5) / textWidth);
  return lines + 1; // marginBottom
}

export interface CheatSheetScreenProps {
  onClose: () => void;
}

/**
 * Compact code display with syntax highlighting (no border, no line numbers)
 */
const CompactCode: React.FC<{ code: string; language?: string }> = ({
  code,
  language = 'typescript',
}) => {
  const highlighted = highlight(code.trim(), { language });
  const lines = highlighted.split('\n');

  return (
    <Box flexDirection="column" marginLeft={2} marginY={1}>
      {lines.map((line, idx) => (
        <Text key={`code-line-${idx}-${line.slice(0, 10)}`}>{line}</Text>
      ))}
    </Box>
  );
};

/**
 * Single snippet display
 */
const SnippetItem: React.FC<{ snippet: CheatSheetSnippet }> = ({ snippet }) => (
  <Box flexDirection="column" marginBottom={1}>
    <Text bold color="green">
      {snippet.title}
    </Text>
    {snippet.description && <Text dimColor>{snippet.description}</Text>}
    {snippet.code && (
      <CompactCode code={snippet.code} language={snippet.language} />
    )}
    {snippet.tip && (
      <Text color="yellow">
        {'  '}💡 {snippet.tip}
      </Text>
    )}
  </Box>
);

export const CheatSheetScreen: React.FC<CheatSheetScreenProps> = ({
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const { width, height } = useTerminalDimensions();
  const category = CHEAT_SHEET_DATA[currentIndex];

  // Höhenbudget für Snippets: Terminalhöhe minus Chrome (Layout-Header/-Footer,
  // Screen-Header, Tabs, Rahmen, Kategorie-Titel, Seitenanzeige). Konservativ,
  // lieber ein Snippet weniger zeigen als stumm clippen.
  const availableLines = Math.max(5, height - 17);

  // Snippets greedy einpassen: ab scrollOffset so viele GANZE Snippets,
  // wie ins Budget passen (mindestens eins)
  const { visibleSnippets, hiddenAbove, hiddenBelow } = useMemo(() => {
    const snippets = category.snippets;
    const offset = Math.min(scrollOffset, Math.max(0, snippets.length - 1));
    const visible: CheatSheetSnippet[] = [];
    let used = 0;
    for (let i = offset; i < snippets.length; i++) {
      const lines = estimateSnippetLines(snippets[i], width);
      if (visible.length > 0 && used + lines > availableLines) break;
      visible.push(snippets[i]);
      used += lines;
    }
    return {
      visibleSnippets: visible,
      hiddenAbove: offset,
      hiddenBelow: snippets.length - offset - visible.length,
    };
  }, [category, scrollOffset, availableLines, width]);

  const switchCategory = (nextIndex: number) => {
    setCurrentIndex(nextIndex);
    setScrollOffset(0);
  };

  useInput((input, key) => {
    if (input === '?' || input === 'q' || key.escape) {
      onClose();
    } else if (key.leftArrow || (key.shift && key.tab)) {
      // Previous category (wrap around)
      switchCategory(currentIndex > 0 ? currentIndex - 1 : CHEAT_SHEET_DATA.length - 1);
    } else if (key.rightArrow || key.tab) {
      // Next category (wrap around)
      switchCategory(currentIndex < CHEAT_SHEET_DATA.length - 1 ? currentIndex + 1 : 0);
    } else if (key.upArrow || input === 'k') {
      setScrollOffset((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow || input === 'j') {
      setScrollOffset((prev) => (hiddenBelow > 0 ? prev + 1 : prev));
    }
  });

  return (
    <Box flexDirection="column" padding={1} width="100%" height="100%">
      {/* Header */}
      <Box
        borderStyle="round"
        borderColor="yellow"
        paddingX={2}
        justifyContent="space-between"
      >
        <Text bold color="yellow">
          📋 Cheat Sheet
        </Text>
        <Text dimColor>[Tab/←/→] Kategorie [ESC] Schließen</Text>
      </Box>

      {/* Category Tabs */}
      <Box marginY={1} gap={2} flexWrap="wrap">
        {CHEAT_SHEET_DATA.map((cat, idx) => (
          <Text
            key={cat.id}
            color={idx === currentIndex ? 'cyan' : 'gray'}
            bold={idx === currentIndex}
            inverse={idx === currentIndex}
          >
             
            {cat.icon} {cat.title} 
          </Text>
        ))}
      </Box>

      {/* Content */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        padding={1}
        flexGrow={1}
        overflow="hidden"
      >
        <Box marginBottom={1} justifyContent="space-between">
          <Text bold color="cyan">
            {category.icon} {category.title}
          </Text>
          {hiddenAbove > 0 && <Text dimColor>↑ {hiddenAbove} weitere oben</Text>}
        </Box>

        <Box flexDirection="column">
          {visibleSnippets.map((snippet) => (
            <SnippetItem key={`snippet-${snippet.title}`} snippet={snippet} />
          ))}
        </Box>

        {hiddenBelow > 0 && (
          <Box>
            <Text dimColor>↓ {hiddenBelow} weitere unten - [↑↓] scrollen</Text>
          </Box>
        )}
      </Box>

      {/* Page indicator */}
      <Box justifyContent="center" marginTop={1}>
        <Text dimColor>
          {currentIndex + 1} / {CHEAT_SHEET_DATA.length}
          {(hiddenAbove > 0 || hiddenBelow > 0) && ' • [↑↓] Scrollen'}
        </Text>
      </Box>
    </Box>
  );
};
