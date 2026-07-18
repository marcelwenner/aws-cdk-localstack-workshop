/**
 * Animation & Geometry Tests für das Live-Dashboard
 *
 * Testet die DYNAMIK, nicht nur statisches Rendering:
 * - Partikel bewegen sich in Pfeilrichtung (Regression: gespiegelte Links-Pipes)
 * - Partikel wandern über Segmentgrenzen (trigger→starter→queue→worker→db/dlq)
 * - ServiceNode-Aktivitätsanzeige animiert über die Zeit
 * - Verbinder-Geometrie: Drop trifft Bogen, DLQ-Pfeil trifft DLQ-Box (spaltengenau)
 *
 * Farben sind in der Testumgebung deaktiviert (kein TTY) - Assertions
 * arbeiten deshalb auf Zeichen und Positionen, nicht auf Farben.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { renderHook } from '@testing-library/react';
import { ParticleStream } from '../ParticleStream.js';
import { ServiceNode } from '../ServiceNode.js';
import { DlqIndicator } from '../DlqIndicator.js';
import { CinematicDiagram } from '../CinematicDiagram.js';
import type { CinematicMetrics } from '../CinematicDiagram.js';
import { useParticleSystem, type Particle } from '../../../hooks/useParticleSystem.js';
import { waitFor } from '../../../__tests__/helpers/ink-test-utils.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function particle(segment: Particle['segment'], position: number, isError = false): Particle {
  return { id: `t-${segment}-${position}`, segment, position, isError };
}

// ---------------------------------------------------------------------------
// ParticleStream: Partikel fließen IMMER in Pfeilrichtung
// ---------------------------------------------------------------------------
describe('ParticleStream direction', () => {
  it('right pipe: higher position renders further right (towards the arrow)', () => {
    const early = render(
      <ParticleStream particles={[particle('trigger-starter', 20)]} segment="trigger-starter" length={10} direction="right" />
    );
    const late = render(
      <ParticleStream particles={[particle('trigger-starter', 80)]} segment="trigger-starter" length={10} direction="right" />
    );
    const earlyIdx = (early.lastFrame() || '').indexOf('o');
    const lateIdx = (late.lastFrame() || '').indexOf('o');
    early.unmount();
    late.unmount();

    expect(earlyIdx).toBeGreaterThanOrEqual(0);
    expect(lateIdx).toBeGreaterThan(earlyIdx);
  });

  it('left pipe: higher position renders further LEFT (mirrored towards the arrow)', () => {
    // Regression: Vor dem Fix liefen Partikel auf Links-Pipes vom Pfeil weg
    const early = render(
      <ParticleStream particles={[particle('worker-db', 20)]} segment="worker-db" length={10} direction="left" />
    );
    const late = render(
      <ParticleStream particles={[particle('worker-db', 80)]} segment="worker-db" length={10} direction="left" />
    );
    const earlyIdx = (early.lastFrame() || '').indexOf('o');
    const lateIdx = (late.lastFrame() || '').indexOf('o');
    early.unmount();
    late.unmount();

    expect(earlyIdx).toBeGreaterThanOrEqual(0);
    expect(lateIdx).toBeLessThan(earlyIdx);
  });

  it('renders error particles as x', () => {
    const { lastFrame, unmount } = render(
      <ParticleStream particles={[particle('worker-dlq', 50, true)]} segment="worker-dlq" length={10} direction="right" />
    );
    expect(lastFrame()).toContain('x');
    expect(lastFrame()).not.toContain('o');
    unmount();
  });

  it('only renders particles of its own segment', () => {
    const { lastFrame, unmount } = render(
      <ParticleStream particles={[particle('starter-queue', 50)]} segment="trigger-starter" length={10} direction="right" />
    );
    expect(lastFrame()).not.toContain('o');
    unmount();
  });
});

// ---------------------------------------------------------------------------
// useParticleSystem: Bewegung + Segment-Chaining
// ---------------------------------------------------------------------------
describe('useParticleSystem', () => {
  const baseConfig = {
    throughput: 0,
    inFlight: 0,
    dlqDelta: 0,
    demoMode: false,
    frameInterval: 20, // schnell für den Test
    isActive: false,
  };

  it('moves particles forward over time', async () => {
    const { result, unmount } = renderHook(() => useParticleSystem(baseConfig));

    result.current.spawnParticle('trigger-starter');
    await waitFor(() => result.current.particles.length > 0, 1000);
    const posBefore = result.current.particles[0].position;

    await waitFor(() => {
      const p = result.current.particles[0];
      return p !== undefined && p.position > posBefore;
    }, 1000);

    unmount();
  });

  it('chains particles into the next segment when they complete', async () => {
    const { result, unmount } = renderHook(() => useParticleSystem(baseConfig));

    result.current.spawnParticle('trigger-starter');
    // 100% / speed 10 pro Frame à 20ms → nach ~200ms Segmentwechsel
    await waitFor(
      () => result.current.particles.some(p => p.segment === 'starter-queue'),
      2000
    );

    unmount();
  });

  it('routes error particles from queue-worker to the DLQ segment', async () => {
    const { result, unmount } = renderHook(() => useParticleSystem(baseConfig));

    result.current.spawnParticle('queue-worker', true);
    await waitFor(
      () => result.current.particles.some(p => p.segment === 'worker-dlq' && p.isError),
      2000
    );

    unmount();
  });
});

// ---------------------------------------------------------------------------
// ServiceNode: Aktivitätsanzeige animiert
// ---------------------------------------------------------------------------
describe('ServiceNode animation', () => {
  it('animates the activity indicator while active', async () => {
    const { lastFrame, unmount } = render(
      <ServiceNode name="WORKER" icon="[W]" status="active" animationSpeed={60} />
    );
    const first = lastFrame();
    expect(first).toMatch(/●/);

    await waitFor(() => lastFrame() !== first, 1000);
    expect(lastFrame()).toMatch(/●/);
    unmount();
  });

  it('shows no activity indicator when idle', async () => {
    const { lastFrame, unmount } = render(
      <ServiceNode name="WORKER" icon="[W]" status="idle" animationSpeed={60} />
    );
    await sleep(150);
    expect(lastFrame()).not.toMatch(/●/);
    unmount();
  });
});

// ---------------------------------------------------------------------------
// DlqIndicator: Eskalationsstufen
// ---------------------------------------------------------------------------
describe('DlqIndicator', () => {
  it('shows ALERT from 3 messages on', () => {
    const calm = render(<DlqIndicator depth={1} />);
    const alert = render(<DlqIndicator depth={3} />);
    expect(calm.lastFrame()).not.toContain('ALERT');
    expect(alert.lastFrame()).toContain('ALERT');
    calm.unmount();
    alert.unmount();
  });
});

// ---------------------------------------------------------------------------
// CinematicDiagram: Geometrie + Stabilität unter Animation
// ---------------------------------------------------------------------------
describe('CinematicDiagram geometry', () => {
  const busyMetrics: CinematicMetrics = {
    queue: { depth: 42, inFlight: 3, dlqDepth: 2 },
    throughput: 5,
    serviceStates: { trigger: 'active', starter: 'active', worker: 'active' },
  };

  function frameLines(frame: string | undefined): string[] {
    return (frame || '').split('\n');
  }

  it('phase 3: queue drop column meets the return-pipe corner exactly', async () => {
    const { lastFrame, unmount } = render(
      <CinematicDiagram phase={3} metrics={busyMetrics} events={[]} />
    );
    await sleep(250);
    const lines = frameLines(lastFrame());

    // Nicht die abgerundete Header-Box erwischen: die Worker-Zeile enthält
    // die Rück-Pipe ('<') UND den Bogen.
    const cornerLine = lines.find(l => l.includes('╯') && l.includes('<'));
    expect(cornerLine).toBeDefined();
    const cornerCol = cornerLine!.indexOf('╯');

    // Drop-Zeilen zwischen Row 1 und Row 2: enthalten nur │ oder o/↻
    const dropLines = lines.filter(l => /^\s*[│o↻]\s*$/.test(l));
    expect(dropLines.length).toBeGreaterThanOrEqual(1);
    for (const drop of dropLines.slice(0, 2)) {
      const dropCol = drop.search(/[│o↻]/);
      expect(dropCol).toBe(cornerCol);
    }
    unmount();
  });

  it('phase 3: DLQ arrow points at the center of the DLQ box', async () => {
    const { lastFrame, unmount } = render(
      <CinematicDiagram phase={3} metrics={busyMetrics} events={[]} />
    );
    await sleep(250);
    const lines = frameLines(lastFrame());

    const arrowLine = lines.find(l => l.includes('▼'));
    expect(arrowLine).toBeDefined();
    const arrowCol = arrowLine!.indexOf('▼');

    // DLQ-Boxrahmen: erste Rahmenzeile NACH dem Pfeil
    const arrowIdx = lines.indexOf(arrowLine!);
    const boxTop = lines.slice(arrowIdx + 1).find(l => /[┌╔]/.test(l));
    expect(boxTop).toBeDefined();
    const boxLeft = boxTop!.search(/[┌╔]/);

    // Box ist 11 Zeichen breit → Mitte bei left + 5
    expect(boxLeft + 5).toBe(arrowCol);
    unmount();
  });

  it('stays layout-stable while particles animate (no line-count jitter)', async () => {
    const { lastFrame, unmount } = render(
      <CinematicDiagram phase={3} metrics={busyMetrics} events={[]} />
    );
    await sleep(150);
    const counts = new Set<number>();
    for (let i = 0; i < 5; i++) {
      counts.add(frameLines(lastFrame()).length);
      await sleep(120);
    }
    expect(counts.size).toBe(1);
    unmount();
  });

  it('never exceeds the terminal width', async () => {
    for (const phase of [1, 2, 3, 4, 5, 6]) {
      const { lastFrame, unmount } = render(
        <CinematicDiagram phase={phase} metrics={busyMetrics} events={[]} />
      );
      await sleep(120);
      for (const line of frameLines(lastFrame())) {
        expect(line.length).toBeLessThanOrEqual(100);
      }
      unmount();
    }
  });

  it('phase 4: backoff panel is honest about live data', async () => {
    const live = render(
      <CinematicDiagram
        phase={4}
        metrics={{ ...busyMetrics, backoff: { delayed: 3, inFlight: 1, online: true } }}
        events={[]}
      />
    );
    await sleep(120);
    expect(live.lastFrame()).toContain('3 delayed');
    live.unmount();

    const offline = render(
      <CinematicDiagram
        phase={4}
        metrics={{ ...busyMetrics, backoff: { delayed: 0, inFlight: 0, online: false } }}
        events={[]}
      />
    );
    await sleep(120);
    expect(offline.lastFrame()).toContain('offline');
    offline.unmount();
  });
});
