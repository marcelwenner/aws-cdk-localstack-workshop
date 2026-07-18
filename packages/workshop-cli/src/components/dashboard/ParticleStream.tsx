import React from 'react';
import { Text } from 'ink';
import type { Particle, PipeSegment } from '../../hooks/useParticleSystem.js';

export interface ParticleStreamProps {
  /** Particles to render */
  particles: Particle[];
  /** Which segment this stream represents */
  segment: PipeSegment;
  /** Length of the pipe in characters */
  length?: number;
  /** Direction of flow */
  direction?: 'right' | 'left' | 'down';
  /** Show arrow at end */
  showArrow?: boolean;
}

// Pipe characters
const PIPE_CHARS = {
  horizontal: '═',
  vertical: '│',
  particle: 'o',
  particleError: 'x',
  arrowRight: '>',
  arrowLeft: '<',
  arrowDown: '▼',
  cornerDownRight: '╯',
  cornerUpLeft: '╭',
};

/**
 * ParticleStream - Renders an animated pipe with flowing particles
 *
 * Example output: "═══o═══o════>"
 *
 * Features:
 * - Particles appear as 'o' (or 'x' for errors)
 * - Configurable length and direction
 * - Arrow indicator at end
 */
export const ParticleStream: React.FC<ParticleStreamProps> = ({
  particles,
  segment,
  length = 10,
  direction = 'right',
  showArrow = true,
}) => {
  // Filter particles for this segment
  const segmentParticles = particles.filter(p => p.segment === segment);

  // Build the pipe string
  const renderPipe = (): string => {
    const pipeChar = direction === 'down' ? PIPE_CHARS.vertical : PIPE_CHARS.horizontal;
    const pipe = Array(length).fill(pipeChar);

    // Place particles - position 0 = source, 100 = destination.
    // For left-flowing pipes the destination is on the LEFT, so mirror
    // the position (otherwise particles visually flow AWAY from the arrow).
    segmentParticles.forEach(p => {
      let pos = Math.floor((p.position / 100) * (length - 1));
      if (direction === 'left') {
        pos = length - 1 - pos;
      }
      if (pos >= 0 && pos < length) {
        pipe[pos] = p.isError ? PIPE_CHARS.particleError : PIPE_CHARS.particle;
      }
    });

    // Add arrow
    if (showArrow) {
      switch (direction) {
        case 'right':
          return pipe.join('') + PIPE_CHARS.arrowRight;
        case 'left':
          return PIPE_CHARS.arrowLeft + pipe.join('');
        case 'down':
          return pipe.join('\n') + '\n' + PIPE_CHARS.arrowDown;
        default:
          return pipe.join('');
      }
    }

    return pipe.join(direction === 'down' ? '\n' : '');
  };

  // Determine color based on particle presence
  const hasParticles = segmentParticles.length > 0;
  const hasErrorParticles = segmentParticles.some(p => p.isError);

  const getColor = (): string => {
    if (hasErrorParticles) return 'red';
    if (hasParticles) return 'cyan';
    return 'gray';
  };

  return (
    <Text color={getColor()}>
      {renderPipe()}
    </Text>
  );
};

/**
 * Render a vertical connector with optional particle
 */
export const VerticalConnector: React.FC<{
  particles: Particle[];
  segment: PipeSegment;
  height?: number;
}> = ({ particles, segment, height = 2 }) => {
  const segmentParticles = particles.filter(p => p.segment === segment);

  return (
    <>
      {Array(height).fill(0).map((_, i) => {
        // Check if any particle is at this position
        const hasParticle = segmentParticles.some(p => {
          const pos = Math.floor((p.position / 100) * height);
          return pos === i;
        });
        const isError = segmentParticles.some(p => {
          const pos = Math.floor((p.position / 100) * height);
          return pos === i && p.isError;
        });

        return (
          <Text key={`vert-${segment}-${i}`} color={isError ? 'red' : hasParticle ? 'cyan' : 'gray'}>
            {hasParticle ? (isError ? 'x' : 'o') : '│'}
          </Text>
        );
      })}
    </>
  );
};

/**
 * Render a corner piece (for Queue -> Worker connection)
 */
export const CornerConnector: React.FC<{
  particles: Particle[];
  segment: PipeSegment;
  type: 'down-left' | 'down-right';
}> = ({ particles, segment, type }) => {
  const segmentParticles = particles.filter(p => p.segment === segment);
  const hasParticle = segmentParticles.length > 0;
  const isError = segmentParticles.some(p => p.isError);

  const char = type === 'down-right' ? '╯' : '╰';

  return (
    <Text color={isError ? 'red' : hasParticle ? 'cyan' : 'gray'}>
      {char}
    </Text>
  );
};

export default ParticleStream;
