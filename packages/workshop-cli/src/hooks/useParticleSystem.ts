import { useState, useEffect, useRef, useCallback } from 'react';

export type PipeSegment =
  | 'trigger-starter'
  | 'starter-queue'
  | 'queue-worker'
  | 'worker-db'
  | 'worker-dlq';

export interface Particle {
  id: string;
  segment: PipeSegment;
  position: number; // 0-100%
  isError: boolean;
}

export interface ParticleSystemConfig {
  /** Messages per second (affects spawn rate) */
  throughput: number;
  /** Current queue in-flight count (affects worker segment) */
  inFlight: number;
  /** DLQ depth change (spawns error particles) */
  dlqDelta: number;
  /** Demo mode slows everything down */
  demoMode: boolean;
  /** Base animation interval in ms */
  frameInterval?: number;
  /** Is there an active request happening? Spawns bidirectional particles */
  isActive?: boolean;
}

interface ParticleSystemState {
  particles: Particle[];
  /** Get particles for a specific segment */
  getSegmentParticles: (segment: PipeSegment) => Particle[];
  /** Manually spawn a particle (e.g., on action) */
  spawnParticle: (segment: PipeSegment, isError?: boolean) => void;
  /** Spawn a burst of particles */
  spawnBurst: (segment: PipeSegment, count: number, isError?: boolean) => void;
}

// Particle limits per segment
const MAX_PARTICLES_PER_SEGMENT = 5;
const MAX_TOTAL_PARTICLES = 30;

let particleIdCounter = 0;

/**
 * useParticleSystem - Manages animated particles flowing through pipes
 *
 * Features:
 * - Particles move from 0% to 100% along their segment
 * - Speed adjusts based on demo mode
 * - Spawn rate based on throughput
 * - Error particles (red) for DLQ
 * - Manual spawn for actions
 */
export function useParticleSystem(config: ParticleSystemConfig): ParticleSystemState {
  const {
    throughput,
    inFlight,
    dlqDelta,
    demoMode,
    frameInterval = 50,
    isActive = false,
  } = config;

  const [particles, setParticles] = useState<Particle[]>([]);
  const lastDlqDepthRef = useRef(0);
  const frameCountRef = useRef(0);

  // Speed: demo mode is 5x slower
  const speed = demoMode ? 2 : 10;
  const interval = demoMode ? frameInterval * 4 : frameInterval;

  // Create a new particle
  const createParticle = useCallback((segment: PipeSegment, isError = false): Particle => {
    return {
      id: `p-${++particleIdCounter}`,
      segment,
      position: 0,
      isError,
    };
  }, []);

  // Spawn a single particle
  const spawnParticle = useCallback((segment: PipeSegment, isError = false) => {
    setParticles(prev => {
      // Check limits
      const segmentCount = prev.filter(p => p.segment === segment).length;
      if (segmentCount >= MAX_PARTICLES_PER_SEGMENT) return prev;
      if (prev.length >= MAX_TOTAL_PARTICLES) return prev;

      return [...prev, createParticle(segment, isError)];
    });
  }, [createParticle]);

  // Spawn multiple particles
  const spawnBurst = useCallback((segment: PipeSegment, count: number, isError = false) => {
    for (let i = 0; i < count; i++) {
      // Stagger the spawns slightly
      setTimeout(() => spawnParticle(segment, isError), i * 100);
    }
  }, [spawnParticle]);

  // Get particles for a segment
  const getSegmentParticles = useCallback((segment: PipeSegment): Particle[] => {
    return particles.filter(p => p.segment === segment);
  }, [particles]);

  // Main animation loop
  useEffect(() => {
    const animationInterval = setInterval(() => {
      frameCountRef.current++;

      setParticles(prev => {
        // Move existing particles
        let updated = prev.map(p => ({
          ...p,
          position: p.position + speed,
        }));

        // Remove particles that completed their segment
        updated = updated.filter(p => p.position < 100);

        // Chain particles to next segment when they complete
        const completed = prev.filter(p => p.position + speed >= 100);
        completed.forEach(p => {
          // Determine next segment
          let nextSegment: PipeSegment | null = null;
          switch (p.segment) {
            case 'trigger-starter':
              nextSegment = 'starter-queue';
              break;
            case 'starter-queue':
              nextSegment = 'queue-worker';
              break;
            case 'queue-worker':
              nextSegment = p.isError ? 'worker-dlq' : 'worker-db';
              break;
            // worker-db and worker-dlq are terminal
          }

          if (nextSegment) {
            const segmentCount = updated.filter(up => up.segment === nextSegment).length;
            if (segmentCount < MAX_PARTICLES_PER_SEGMENT && updated.length < MAX_TOTAL_PARTICLES) {
              updated.push({
                ...p,
                id: `p-${++particleIdCounter}`,
                segment: nextSegment,
                position: 0,
              });
            }
          }
        });

        return updated;
      });

      // Auto-spawn based on throughput (every N frames)
      const spawnInterval = throughput > 0 ? Math.max(2, Math.floor(20 / throughput)) : 999;
      if (throughput > 0 && frameCountRef.current % spawnInterval === 0) {
        spawnParticle('trigger-starter', false);
      }

      // When active, spawn particles in both directions (request + response)
      if (isActive && frameCountRef.current % 4 === 0) {
        // Request direction: trigger -> starter -> queue
        spawnParticle('trigger-starter', false);
        // Response direction: worker-db and queue-worker (reverse flow)
        spawnParticle('worker-db', false);
        spawnParticle('queue-worker', false);
      }

    }, interval);

    return () => clearInterval(animationInterval);
  }, [speed, interval, throughput, isActive, spawnParticle]);

  // Spawn error particles when DLQ increases
  useEffect(() => {
    if (dlqDelta > lastDlqDepthRef.current) {
      const newErrors = dlqDelta - lastDlqDepthRef.current;
      for (let i = 0; i < Math.min(newErrors, 3); i++) {
        spawnParticle('worker-dlq', true);
      }
    }
    lastDlqDepthRef.current = dlqDelta;
  }, [dlqDelta, spawnParticle]);

  // Spawn particles when there's in-flight activity
  useEffect(() => {
    if (inFlight > 0) {
      // Spawn some particles in the worker segment
      const workerParticles = particles.filter(p => p.segment === 'queue-worker').length;
      if (workerParticles < 2) {
        spawnParticle('queue-worker', false);
      }
    }
  }, [inFlight, particles, spawnParticle]);

  return {
    particles,
    getSegmentParticles,
    spawnParticle,
    spawnBurst,
  };
}

export default useParticleSystem;
