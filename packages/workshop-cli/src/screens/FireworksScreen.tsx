import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import { TypewriterText } from '../components/animations/TypewriterText.js';
import { StateManager, type PhaseTime } from '../core/state/workshop-state.js';

const stateManager = new StateManager();

interface FireworksScreenProps {
  startTime: string;
  onExit: () => void;
}

/**
 * Fullscreen Fireworks Celebration Screen
 *
 * Shown when the user completes the final phase (Phase 6).
 * Features:
 * - Animated ASCII fireworks with emojis
 * - BigText "GESCHAFFT!" with rainbow gradient
 * - TypewriterText for thank you message
 * - Workshop statistics
 * - Only Enter key to exit
 */
export const FireworksScreen: React.FC<FireworksScreenProps> = ({
  startTime,
  onExit,
}) => {
  const [animationPhase, setAnimationPhase] = useState(0);
  const [showEnterHint, setShowEnterHint] = useState(true);
  const [phaseTimes, setPhaseTimes] = useState<Record<number, PhaseTime>>({});

  // Load phase times on mount
  useEffect(() => {
    stateManager.getAllPhaseTimes()
      .then(times => setPhaseTimes(times))
      .catch(() => {});
  }, []);

  // Animation phases progression
  useEffect(() => {
    const timer = setInterval(() => {
      setAnimationPhase(prev => Math.min(prev + 1, 5));
    }, 800);
    return () => clearInterval(timer);
  }, []);

  // Blinking Enter hint
  useEffect(() => {
    if (animationPhase >= 4) {
      const blinkTimer = setInterval(() => {
        setShowEnterHint(prev => !prev);
      }, 600);
      return () => clearInterval(blinkTimer);
    }
  }, [animationPhase]);

  // Only Enter key allowed
  useInput((input, key) => {
    if (key.return) {
      onExit();
    }
    // All other keys are ignored
  });

  // Format seconds to human-readable time
  const formatTime = (seconds: number | undefined): string => {
    if (!seconds) return '--';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  // Calculate workshop duration
  const getDuration = (): string => {
    try {
      const start = new Date(startTime);
      const now = new Date();
      const diffMs = now.getTime() - start.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const remainingMins = diffMins % 60;

      if (diffHours > 0) {
        return `${diffHours}h ${remainingMins}min`;
      }
      return `${diffMins} Minuten`;
    } catch {
      return 'N/A';
    }
  };

  // Get phase times for display (only show phases with recorded times)
  const getPhaseTimesDisplay = () => {
    return Object.entries(phaseTimes)
      .filter(([phase, time]) => parseInt(phase) >= 1 && time.duration)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([phase, time]) => ({
        phase: parseInt(phase),
        duration: time.duration || 0,
      }));
  };

  // Firework explosion patterns
  const fireworkPatterns = [
    // Phase 0: Rockets launching
    [
      '            ',
      '     |      ',
      '     |      ',
      '    |||     ',
      '   |||||    ',
    ],
    // Phase 1: First explosion
    [
      '     *      ',
      '    ***     ',
      '   *****    ',
      '    ***     ',
      '     *      ',
    ],
    // Phase 2: Colorful burst
    [
      '   ✨ * ✨   ',
      '  * ✨ ✨ *  ',
      ' ✨ * * * ✨ ',
      '  * ✨ ✨ *  ',
      '   ✨ * ✨   ',
    ],
    // Phase 3+: Full celebration
    [
      '  🎆  ✨  🎆  ',
      ' ✨ 🎇  🎇 ✨ ',
      '🎆 ✨ 🌟 ✨ 🎆',
      ' ✨ 🎇  🎇 ✨ ',
      '  🎆  ✨  🎆  ',
    ],
  ];

  const currentFirework = fireworkPatterns[Math.min(animationPhase, 3)];

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width="100%"
      height="100%"
      paddingY={1}
    >
      {/* Fireworks Animation */}
      {animationPhase >= 0 && (
        <Box flexDirection="column" alignItems="center" marginBottom={1}>
          {currentFirework.map((line, i) => (
            <Text key={`firework-line-${i}-${line.length}`} color={animationPhase >= 3 ? 'yellow' : 'white'}>
              {line}
            </Text>
          ))}
        </Box>
      )}

      {/* Main Title with Rainbow Gradient */}
      {animationPhase >= 2 && (
        <Box marginY={1}>
          <Gradient name="rainbow">
            <BigText text="GESCHAFFT!" font="tiny" />
          </Gradient>
        </Box>
      )}

      {/* Decorative line */}
      {animationPhase >= 2 && (
        <Box marginBottom={1}>
          <Gradient name="passion">
            <Text>{'━'.repeat(45)}</Text>
          </Gradient>
        </Box>
      )}

      {/* Thank you message with Typewriter effect */}
      {animationPhase >= 3 && (
        <Box flexDirection="column" alignItems="center" marginY={1}>
          <TypewriterText
            text="Workshop abgeschlossen!"
            speed={40}
            color="green"
            bold
          />
          {animationPhase >= 4 && (
            <Box marginTop={1}>
              <TypewriterText
                text="Vielen Dank für die Teilnahme!"
                speed={30}
                color="cyan"
              />
            </Box>
          )}
        </Box>
      )}

      {/* Statistics Box */}
      {animationPhase >= 4 && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="yellow"
          paddingX={3}
          paddingY={1}
          marginY={1}
        >
          <Box justifyContent="center" marginBottom={1}>
            <Gradient name="cristal">
              <Text bold>Deine Statistiken</Text>
            </Gradient>
          </Box>

          <Box flexDirection="column">
            <Box>
              <Text color="gray">Gesamt:   </Text>
              <Text color="white" bold>{getDuration()}</Text>
            </Box>
            <Box>
              <Text color="gray">Phasen:   </Text>
              <Text color="green" bold>6/6 </Text>
              <Text color="green">✓</Text>
            </Box>
          </Box>

          {/* Phase times breakdown */}
          {getPhaseTimesDisplay().length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text color="gray" dimColor>Zeit pro Phase:</Text>
              <Box flexDirection="row" flexWrap="wrap" gap={1}>
                {getPhaseTimesDisplay().map(({ phase, duration }) => (
                  <Box key={phase}>
                    <Text dimColor>P{phase}: </Text>
                    <Text color="cyan">{formatTime(duration)}</Text>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      )}

      {/* What you learned */}
      {animationPhase >= 5 && (
        <Box
          flexDirection="column"
          marginY={1}
          paddingX={2}
        >
          <Box justifyContent="center" marginBottom={1}>
            <Text color="yellow" bold>Was du gelernt hast:</Text>
          </Box>
          <Box flexDirection="column" paddingLeft={2}>
            <Text color="green">  ✓ Worker Pattern (Self-Triggering Lambda)</Text>
            <Text color="green">  ✓ Polling Pattern (Exponential Backoff)</Text>
            <Text color="green">  ✓ Dead Letter Queues (DLQ)</Text>
            <Text color="green">  ✓ Structured Logging</Text>
            <Text color="green">  ✓ LocalStack für lokale AWS-Entwicklung</Text>
          </Box>
        </Box>
      )}

      {/* Enter to exit hint (pulsing) */}
      {animationPhase >= 4 && (
        <Box marginTop={2}>
          <Text
            color={showEnterHint ? 'cyan' : 'gray'}
            bold={showEnterHint}
            dimColor={!showEnterHint}
          >
            [ Enter zum Beenden ]
          </Text>
        </Box>
      )}

      {/* Bottom decorative sparkles */}
      {animationPhase >= 3 && (
        <Box marginTop={1}>
          <Gradient name="retro">
            <Text>{'✨ '.repeat(15)}</Text>
          </Gradient>
        </Box>
      )}
    </Box>
  );
};
