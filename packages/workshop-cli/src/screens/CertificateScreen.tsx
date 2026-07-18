/**
 * CertificateScreen - Zertifikat nach bestandener Abschlussprüfung
 *
 * Wird nur erreicht, wenn der Phase-6-Validator (die strenge Prüfung)
 * bestanden wurde. Fragt den Namen ab, rendert das PDF und zeigt den Pfad.
 */
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { generateCertificate, VALIDATED_SKILLS, type CertificateResult } from '../lib/certificate.js';
import { StateManager } from '../core/state/workshop-state.js';

const stateManager = new StateManager();

export interface CertificateScreenProps {
  onDone: () => void;
  /** Injizierbar für Tests - default ist der echte PDF-Generator */
  generateFn?: typeof generateCertificate;
}

type ScreenState = 'input' | 'generating' | 'done' | 'error';

export const CertificateScreen: React.FC<CertificateScreenProps> = ({
  onDone,
  generateFn = generateCertificate,
}) => {
  const [name, setName] = useState('');
  const [state, setState] = useState<ScreenState>('input');
  const [result, setResult] = useState<CertificateResult | null>(null);
  const [error, setError] = useState('');

  const generate = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    setState('generating');
    try {
      const workshopState = await stateManager.loadState().catch(() => null);
      const startTime = workshopState?.startTime ? new Date(workshopState.startTime) : null;
      const minutes = startTime ? Math.max(0, Math.floor((Date.now() - startTime.getTime()) / 60000)) : 0;
      const durationLabel = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}min` : `${minutes}min`;
      const quizCount = workshopState?.completedQuizzes?.length ?? 0;
      const quizLabel = `${quizCount} Quiz${quizCount === 1 ? '' : 'ze'} bestanden`;

      const certificate = await generateFn({
        name: trimmed,
        date: new Date().toISOString(),
        durationLabel,
        quizLabel,
      });
      setResult(certificate);
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  };

  useInput((_input, key) => {
    if (state === 'done' || state === 'error') {
      if (key.return) onDone();
    }
  });

  return (
    <Box flexDirection="column" padding={2} alignItems="center" justifyContent="center" height="100%">
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor="green"
        paddingX={4}
        paddingY={1}
        width={78}
      >
        <Text bold color="green">🏆 Abschlussprüfung bestanden!</Text>
        <Box marginY={1} flexDirection="column">
          <Text>Alle fünf Ebenen streng validiert:</Text>
          {VALIDATED_SKILLS.map((skill, i) => (
            <Text key={skill} dimColor>  {i + 1}. {skill}</Text>
          ))}
        </Box>

        {state === 'input' && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Name fürs Zertifikat:</Text>
            <Box>
              <Text color="cyan">❯ </Text>
              <TextInput value={name} onChange={setName} onSubmit={generate} placeholder="Vor- und Nachname" />
            </Box>
            <Text dimColor>[Enter] Zertifikat erstellen</Text>
          </Box>
        )}

        {state === 'generating' && (
          <Box marginTop={1}>
            <Text color="yellow">Erstelle Zertifikat...</Text>
          </Box>
        )}

        {state === 'done' && result && (
          <Box flexDirection="column" marginTop={1}>
            <Text color="green" bold>✓ Zertifikat erstellt:</Text>
            <Text color="cyan">  {result.pdfPath || result.htmlPath}</Text>
            {!result.pdfPath && (
              <Text dimColor>  (kein Chrome/Edge gefunden - HTML im Browser öffnen und drucken)</Text>
            )}
            <Text dimColor>  Prüfcode: {result.pruefcode}</Text>
            <Box marginTop={1}>
              <Text><Text color="green" bold>[Enter]</Text> Weiter zum Finale 🎆</Text>
            </Box>
          </Box>
        )}

        {state === 'error' && (
          <Box flexDirection="column" marginTop={1}>
            <Text color="red">✗ Zertifikat fehlgeschlagen: {error.slice(0, 120)}</Text>
            <Text dimColor>[Enter] Trotzdem weiter zum Finale</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
