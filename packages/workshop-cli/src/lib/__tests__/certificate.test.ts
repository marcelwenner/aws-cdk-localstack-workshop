/**
 * Zertifikat-Tests: Prüfcode, Slug, HTML-Rendering
 */
import { describe, it, expect } from 'vitest';
import { buildPruefcode, slugify, renderCertificateHtml, VALIDATED_SKILLS } from '../certificate.js';

describe('buildPruefcode', () => {
  it('is deterministic and formatted as XXXX-XXXX-XXXX', () => {
    const a = buildPruefcode('Max Mustermann', '2026-07-10T12:00:00.000Z');
    const b = buildPruefcode('Max Mustermann', '2026-07-10T12:00:00.000Z');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it('changes with name and date', () => {
    const base = buildPruefcode('Max', '2026-07-10T12:00:00.000Z');
    expect(buildPruefcode('Moritz', '2026-07-10T12:00:00.000Z')).not.toBe(base);
    expect(buildPruefcode('Max', '2026-07-11T12:00:00.000Z')).not.toBe(base);
  });
});

describe('slugify', () => {
  it('handles umlauts and specials', () => {
    expect(slugify('Jörg Müller-Lüdenscheidt')).toBe('joerg-mueller-luedenscheidt');
    expect(slugify('  Straße  ')).toBe('strasse');
    expect(slugify('???')).toBe('teilnehmer');
  });
});

describe('renderCertificateHtml', () => {
  const data = {
    name: 'Max Mustermann',
    date: '2026-07-10T12:00:00.000Z',
    durationLabel: '6h 41min',
    quizLabel: '7 Quizze bestanden',
  };

  it('contains name, code, duration and all validated skills', () => {
    const html = renderCertificateHtml(data);
    expect(html).toContain('Max Mustermann');
    expect(html).toContain(buildPruefcode(data.name, data.date));
    expect(html).toContain('6h 41min');
    for (const skill of VALIDATED_SKILLS) {
      expect(html).toContain(skill);
    }
  });

  it('is honest about what it is', () => {
    const html = renderCertificateHtml(data);
    expect(html).toContain('Kein akkreditiertes Zertifikat');
  });

  it('escapes html in the name', () => {
    const html = renderCertificateHtml({ ...data, name: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});
