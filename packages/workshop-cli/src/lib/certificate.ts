/**
 * Abschluss-Zertifikat (PDF)
 *
 * Von der CLI ausgestellt, nachdem die Phase-6-Prüfung bestanden wurde.
 * Ehrlich gelabelt: maschinell validiert, nicht handsigniert. Der Prüfcode
 * ist ein Hash über die Prüfdaten - Deko mit Determinismus, kein Beweis.
 *
 * PDF-Rendering über Edge/Chrome headless (kein npm-Paket nötig, gleiche
 * Technik wie der Folien-Export). Ohne Browser fällt es auf HTML zurück.
 */

import { createHash } from 'crypto';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { pathToFileURL } from 'url';
import { execa } from 'execa';
import { getProjectRoot } from './paths.js';

export interface CertificateData {
  name: string;
  /** ISO-Datum der Prüfung */
  date: string;
  /** z.B. "6h 41min" */
  durationLabel: string;
  /** z.B. "7/7 Quizze bestanden" */
  quizLabel: string;
}

export const VALIDATED_SKILLS = [
  'Ein CDK-Construct eigenständig geschrieben (NodejsFunction, Least-Privilege-Grant, keine hartkodierten ARNs)',
  'Die Infrastruktur deployed und den Fan-Out selbst ausgelöst',
  'Einen verteilten Task bis COMPLETED durch Worker und Queues gebracht',
  'Das Completion-Event in der Ziel-Queue nachgewiesen',
  'Die eigene Infrastruktur mit einem CDK-Assertions-Test abgesichert',
] as const;

export function buildPruefcode(name: string, dateIso: string): string {
  const hex = createHash('sha256').update(`${name}|${dateIso}|gesellenstueck`).digest('hex').toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, c => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c] as string))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'teilnehmer';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderCertificateHtml(data: CertificateData): string {
  const code = buildPruefcode(data.name, data.date);
  const dateLabel = new Date(data.date).toLocaleDateString('de-DE', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const skills = VALIDATED_SKILLS.map(s => `<li>${escapeHtml(s)}</li>`).join('\n        ');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Zertifikat - ${escapeHtml(data.name)}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    color: #26282b;
    width: 297mm; height: 210mm;
    display: flex; align-items: center; justify-content: center;
    background: #f6f4ef;
  }
  .frame {
    width: 270mm; height: 184mm;
    border: 2px solid #26282b;
    outline: 1px solid #26282b;
    outline-offset: 6px;
    padding: 16mm 20mm;
    display: flex; flex-direction: column;
    background: #fffdf8;
  }
  .kicker {
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 11px; letter-spacing: .35em; text-transform: uppercase; color: #8a8378;
  }
  h1 { font-size: 40px; font-weight: normal; margin: 6mm 0 2mm; }
  .name { font-size: 30px; margin: 6mm 0 1mm; }
  .rule { width: 60mm; border-bottom: 1px solid #26282b; margin: 2mm 0 6mm; }
  p.lead { font-size: 15px; line-height: 1.5; max-width: 200mm; }
  ul { margin: 5mm 0 0 6mm; font-size: 13px; line-height: 1.7; max-width: 210mm; }
  .footer {
    margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end;
    font-family: 'Segoe UI', system-ui, sans-serif; font-size: 11px; color: #6f6a61;
  }
  .code { font-family: Consolas, monospace; font-size: 12px; color: #26282b; }
  .honest { font-style: italic; }
</style>
</head>
<body>
  <div class="frame">
    <div class="kicker">AWS CDK &amp; LocalStack Workshop · Abschlussprüfung</div>
    <h1>Gesellenstück</h1>
    <div class="name">${escapeHtml(data.name)}</div>
    <div class="rule"></div>
    <p class="lead">hat die Abschlussprüfung bestanden: den kompletten Deletion-Flow
    eigenhändig gebaut, deployed und gegen laufende Infrastruktur nachgewiesen.
    Streng validiert auf fünf Ebenen, ohne Musterlösung, ohne Hints.</p>
    <ul>
        ${skills}
    </ul>
    <div class="footer">
      <div>
        <div>${dateLabel} · Workshop-Dauer: ${escapeHtml(data.durationLabel)} · ${escapeHtml(data.quizLabel)}</div>
        <div class="honest">Maschinell validiert von der Workshop-CLI. Kein akkreditiertes Zertifikat, aber ehrlich verdient.</div>
      </div>
      <div class="code">Prüfcode ${code}</div>
    </div>
  </div>
</body>
</html>`;
}

function findBrowser(): string | null {
  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      ]
    : process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        ]
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.find(existsSync) ?? null;
}

export interface CertificateResult {
  pdfPath?: string;
  htmlPath: string;
  pruefcode: string;
}

export async function generateCertificate(data: CertificateData): Promise<CertificateResult> {
  const html = renderCertificateHtml(data);
  const slug = slugify(data.name);
  const htmlPath = join(tmpdir(), `workshop-zertifikat-${slug}.html`);
  writeFileSync(htmlPath, html, 'utf-8');

  const pruefcode = buildPruefcode(data.name, data.date);
  const browser = findBrowser();
  if (!browser) {
    // Fallback: HTML neben das Repo legen, Nutzer druckt selbst
    const fallback = join(getProjectRoot(), `zertifikat-${slug}.html`);
    writeFileSync(fallback, html, 'utf-8');
    return { htmlPath: fallback, pruefcode };
  }

  const pdfPath = join(getProjectRoot(), `zertifikat-${slug}.pdf`);
  await execa(browser, [
    '--headless',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href,
  ], { timeout: 60_000 });

  if (!existsSync(pdfPath)) {
    return { htmlPath, pruefcode };
  }
  return { pdfPath, htmlPath, pruefcode };
}
