/**
 * SecretCodeInput - Wordle-style Code Verification Input
 *
 * Visual code entry with live character-by-character validation:
 * - Template shows expected format with dim placeholders
 * - Correct characters reveal in green with glow effect
 * - Wrong characters flash red
 * - Satisfying "decrypt" aesthetic
 */
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

interface SecretCodeInputProps {
  secret: string;              // The expected code (participants find it in the logs)
  masterSecret?: string;       // Trainer-Fallback: gleiche Maske, öffnet immer
  onSuccess: () => void;       // Called when secret is entered correctly
  onCancel: () => void;        // Called on Escape
}

// Character states for visual feedback
type CharState = 'empty' | 'correct' | 'wrong' | 'cursor';

interface CharDisplay {
  char: string;
  state: CharState;
  expected: string;
}

export const SecretCodeInput: React.FC<SecretCodeInputProps> = ({
  secret,
  masterSecret,
  onSuccess,
  onCancel,
}) => {
  const [input, setInput] = useState('');

  const isAccepted = (value: string): boolean =>
    value === secret || (!!masterSecret && value === masterSecret);

  /**
   * Zeichen anhängen - funktional und chunk-fähig. Ink liefert bei Paste
   * mehrere Zeichen in EINEM Aufruf, und bei schnellem Tippen dürfen
   * Updates nicht auf einer veralteten Closure basieren (verlorene Zeichen!).
   */
  const appendChars = (prev: string, chunk: string): string => {
    let next = prev;
    for (const c of chunk.toUpperCase()) {
      if (!/[A-Z0-9]/.test(c)) continue; // Dashes/Sonstiges überspringen (werden auto-eingefügt)
      if (next.length >= secret.length) break;
      next += c;
      // Auto-insert dashes if next character in secret is a dash
      while (next.length < secret.length && secret[next.length] === '-') {
        next += '-';
      }
    }
    return next;
  };

  // Auto-Check, sobald der Code vollständig ist (unabhängig vom Eingabeweg)
  useEffect(() => {
    if (input.length === secret.length && input.length > 0) {
      if (isAccepted(input)) {
        setSuccess(true);
      } else {
        setShake(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, secret]);
  const [shake, setShake] = useState(false);
  const [success, setSuccess] = useState(false);
  const [celebrationFrame, setCelebrationFrame] = useState(0);

  // Success celebration animation
  useEffect(() => {
    if (success) {
      const interval = setInterval(() => {
        setCelebrationFrame(f => (f + 1) % 6);
      }, 150);

      // Auto-proceed after animation
      const timeout = setTimeout(() => {
        onSuccess();
      }, 1200);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [success, onSuccess]);

  // Shake animation reset
  useEffect(() => {
    if (shake) {
      const timeout = setTimeout(() => setShake(false), 300);
      return () => clearTimeout(timeout);
    }
  }, [shake]);

  // Handle keyboard input
  useInput((char, key) => {
    if (success) return; // Ignore input during success animation

    if (key.escape) {
      onCancel();
      return;
    }

    if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
      return;
    }

    if (key.return) {
      // Check if complete
      if (isAccepted(input.toUpperCase())) {
        setSuccess(true);
      } else if (input.length > 0) {
        setShake(true);
      }
      return;
    }

    // Alphanumerik anhängen - auch als Chunk (Paste). Dashes fügt
    // appendChars automatisch ein, der Auto-Check läuft im Effect.
    if (/[a-zA-Z0-9]/.test(char)) {
      setInput(prev => appendChars(prev, char));
    }
  });

  // Build character display array
  // Shows: SXXXXXXXXX-XXXXX-XXXX with typed chars colored
  const getCharDisplays = (): CharDisplay[] => {
    return secret.split('').map((expected, i) => {
      const typed = input[i]?.toUpperCase();

      if (i < input.length) {
        // Typed character - show actual letter in green (correct) or red (wrong)
        const isCorrect = typed === expected;
        return {
          char: typed,
          state: isCorrect ? 'correct' : 'wrong',
          expected
        };
      } else if (i === input.length) {
        // Cursor position - blinking X
        return { char: expected === '-' ? '-' : 'X', state: 'cursor' as CharState, expected };
      } else {
        // Empty slot - show X (or dash)
        return { char: expected === '-' ? '-' : 'X', state: 'empty', expected };
      }
    });
  };

  const chars = getCharDisplays();

  // Count correct characters for progress
  const correctCount = chars.filter(c => c.state === 'correct').length;
  const totalNonDash = secret.replace(/-/g, '').length;
  const correctNonDash = chars.filter(c => c.state === 'correct' && c.expected !== '-').length;

  // Celebration frames
  const celebrationEmojis = ['🔓', '✨', '🎉', '🚀', '💚', '✓'];

  // Progress bar
  const progressWidth = 20;
  const filledWidth = Math.floor((correctNonDash / totalNonDash) * progressWidth);

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Code Display - Wordle Style */}
      <Box
        flexDirection="row"
        justifyContent="center"
        marginY={1}
      >
        <Box
          borderStyle="round"
          borderColor={success ? 'green' : shake ? 'red' : 'yellow'}
          paddingX={2}
          paddingY={1}
        >
          <Box flexDirection="row" gap={0}>
            {chars.map((display, i) => {
              // Group styling - add space after dashes
              const addSpace = display.expected === '-';

              let color: string;
              let bgColor: string | undefined;
              let bold = false;

              if (success) {
                // Celebration mode - wave of green
                const wavePos = (celebrationFrame + i) % 6;
                color = wavePos < 3 ? 'greenBright' : 'green';
                bold = wavePos < 2;
              } else {
                switch (display.state) {
                  case 'correct':
                    color = 'green';
                    bold = true;
                    break;
                  case 'wrong':
                    color = 'red';
                    bold = true;
                    bgColor = shake ? 'red' : undefined;
                    break;
                  case 'cursor':
                    color = 'yellow';
                    break;
                  case 'empty':
                  default:
                    color = display.char === '-' ? 'gray' : 'blackBright';
                }
              }

              return (
                <Text
                  key={`char-${i}-${display.expected}`}
                  color={color}
                  backgroundColor={bgColor}
                  bold={bold}
                >
                  {display.char}{addSpace ? ' ' : ''}
                </Text>
              );
            })}
          </Box>
        </Box>
      </Box>

      {/* Progress Indicator */}
      {!success && (
        <Box justifyContent="center" marginBottom={1}>
          <Text dimColor>[</Text>
          <Text color="green">{'█'.repeat(filledWidth)}</Text>
          <Text dimColor>{'░'.repeat(progressWidth - filledWidth)}</Text>
          <Text dimColor>] </Text>
          <Text color={correctNonDash === totalNonDash ? 'green' : 'yellow'}>
            {correctNonDash}/{totalNonDash}
          </Text>
        </Box>
      )}

      {/* Success Message */}
      {success && (
        <Box justifyContent="center" marginY={1}>
          <Text color="green" bold>
            {celebrationEmojis[celebrationFrame]} ACCESS GRANTED {celebrationEmojis[celebrationFrame]}
          </Text>
        </Box>
      )}

      {/* Hint for format (dynamisch aus dem erwarteten Code abgeleitet) */}
      {!success && input.length === 0 && (
        <Box justifyContent="center">
          <Text dimColor>Format: {secret.replace(/[^-]/g, 'X')}</Text>
        </Box>
      )}

      {/* Error hint on shake */}
      {shake && (
        <Box justifyContent="center" marginTop={1}>
          <Text color="red">✗ Code falsch! Schau nochmal in die Logs.</Text>
        </Box>
      )}
    </Box>
  );
};
