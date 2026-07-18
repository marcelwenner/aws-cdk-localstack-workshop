import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { CodeSnippet } from '../components/display/CodeSnippet.js';
import { SelectPrompt } from '../components/prompts/SelectPrompt.js';
import { checkLambdaExists } from '../core/infrastructure/index.js';
import { workshopConfig } from '../core/config/workshop.config.js';

interface TutorialScreenProps {
  onComplete: () => void;
}

type TutorialStep = 1 | 2 | 3 | 4 | 5;
type StepState = 'learning' | 'quiz' | 'validating' | 'passed' | 'failed';

interface StepQuiz {
  question: string;
  options: { label: string; value: string }[];
  correctAnswer: string;
  explanation: string;
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * TutorialScreen - Phase 0: Mandatory CDK Tutorial (5 focused steps)
 *
 * Each step has AUTOMATIC VALIDATION - the user doesn't just click "next".
 * Steps are validated either through:
 * - File existence checks
 * - Quiz questions (understanding proof)
 * - Infrastructure checks (Lambda deployed)
 *
 * Steps:
 * 1. "Wo ist die Infrastruktur?" - Quiz: Where is the CDK stack?
 * 2. "Eine Lambda verstehen" - Quiz: What are the 4 key properties?
 * 3. "Environment Variables" - Quiz: Why postgres instead of localhost?
 * 4. "Permissions mit grant" - Quiz: How do you grant permissions?
 * 5. "Erstes Deploy" - Validation: Lambda deployed in LocalStack
 */
export const TutorialScreen: React.FC<TutorialScreenProps> = ({ onComplete }) => {
  const [step, setStep] = useState<TutorialStep>(1);
  const [stepState, setStepState] = useState<StepState>('learning');
  const [quizAnswer, setQuizAnswer] = useState<string | null>(null);
  const [deployWaiting, setDeployWaiting] = useState(false);
  const [lambdaFound, setLambdaFound] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  // Quiz definitions for each step
  const quizzes: Record<TutorialStep, StepQuiz | null> = {
    1: {
      question: 'Wo definierst du die Lambda-Infrastruktur?',
      options: [
        { label: 'packages/*/src/', value: 'packages' },
        { label: 'cdk/lib/workshop-stack.ts', value: 'cdk' },
        { label: 'node_modules/', value: 'node_modules' },
      ],
      correctAnswer: 'cdk',
      explanation: 'Richtig! CDK-Stack definiert WAS deployed wird, packages/ enthält den Code.',
    },
    2: {
      question: 'Was definiert der "entry" Parameter einer NodejsFunction?',
      options: [
        { label: 'Den Namen in AWS', value: 'name' },
        { label: 'Den Pfad zum Handler TypeScript', value: 'entry' },
        { label: 'Die Umgebungsvariablen', value: 'env' },
      ],
      correctAnswer: 'entry',
      explanation: 'Genau! entry zeigt auf deine Handler-Datei (z.B. lambda-handler.ts).',
    },
    3: {
      question: 'Warum steht DB_HOST: "postgres" statt "localhost"?',
      options: [
        { label: 'Postgres ist ein besserer Name', value: 'name' },
        { label: 'Lambda läuft in Docker, muss Container-Namen verwenden', value: 'docker' },
        { label: 'localhost funktioniert nicht in AWS', value: 'aws' },
      ],
      correctAnswer: 'docker',
      explanation: 'Korrekt! Lambda läuft in LocalStack (Docker). "postgres" ist der Container-Name im Docker-Netzwerk.',
    },
    4: {
      question: 'Wie gibst du einer Lambda Berechtigung auf eine Queue zu schreiben?',
      options: [
        { label: 'lambda.addPermission(queue)', value: 'addPerm' },
        { label: 'queue.grantSendMessages(lambda)', value: 'grant' },
        { label: 'new IAMPolicy({ actions: ["sqs:*"] })', value: 'iam' },
      ],
      correctAnswer: 'grant',
      explanation: 'Perfekt! Das grant-Pattern ist CDK Best Practice. queue.grantSendMessages(lambda) erstellt minimale IAM Policy.',
    },
    5: null, // Step 5 uses Lambda existence check instead of quiz
  };

  // Poll for Lambda existence when waiting for deploy (Step 5)
  useEffect(() => {
    if (!deployWaiting) return;

    const pollInterval = setInterval(async () => {
      try {
        const exists = await checkLambdaExists(workshopConfig.lambdas.GetTableList);
        if (exists) {
          setLambdaFound(true);
          setDeployWaiting(false);
          setStepState('passed');
        } else {
          setPollCount(c => c + 1);
        }
      } catch {
        setPollCount(c => c + 1);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [deployWaiting]);

  // Handle quiz answer
  const handleQuizAnswer = (answer: string) => {
    setQuizAnswer(answer);
    const quiz = quizzes[step];
    if (quiz && answer === quiz.correctAnswer) {
      setStepState('passed');
    } else {
      setStepState('failed');
    }
  };

  // Move to next step or complete
  const nextStep = () => {
    if (step === 5 && lambdaFound) {
      onComplete();
    } else if (step < 5) {
      setStep((step + 1) as TutorialStep);
      setStepState('learning');
      setQuizAnswer(null);
    }
  };

  // Retry quiz
  const retryQuiz = () => {
    setStepState('quiz');
    setQuizAnswer(null);
  };

  // Keyboard navigation
  useInput((input, key) => {
    if (deployWaiting) return;

    const lowerInput = input.toLowerCase();

    // In learning state, 'w' moves to quiz
    if (stepState === 'learning') {
      if (lowerInput === 'w' || key.rightArrow) {
        if (step === 5) {
          // Step 5 goes directly to deploy waiting
          setDeployWaiting(true);
          setPollCount(0);
        } else {
          setStepState('quiz');
        }
      }
    }

    // In passed state, 'w' moves to next step
    if (stepState === 'passed') {
      if (lowerInput === 'w' || key.rightArrow) {
        nextStep();
      }
    }

    // Back navigation (only in learning state)
    if (stepState === 'learning' && step > 1) {
      if (lowerInput === 'z' || key.leftArrow) {
        setStep((step - 1) as TutorialStep);
      }
    }
  });

  // Step 1: Wo ist die Infrastruktur?
  const renderStep1Learning = () => (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">📁 Workshop-Struktur</Text>
      </Box>
      <Box flexDirection="column" borderStyle="single" borderColor="gray" padding={1}>
        <Text>
          <Text color="yellow">cdk/lib/workshop-stack.ts</Text>
          <Text dimColor>  ← HIER definierst du Lambdas</Text>
        </Text>
        <Text>
          <Text color="green">packages/*/src/</Text>
          <Text dimColor>            ← HIER schreibst du Code</Text>
        </Text>
      </Box>
      <Box marginY={1}>
        <Text>CDK ist dein <Text bold>"Bauplan"</Text> für AWS.</Text>
      </Box>
      <Text dimColor>Du beschreibst WAS du willst (Lambda, Queue, etc.)</Text>
      <Text dimColor>CDK erstellt es in AWS (oder LocalStack).</Text>
      <Box marginTop={1} borderStyle="single" borderColor="yellow" paddingX={2}>
        <Box flexDirection="column">
          <Text color="yellow">💡 Öffne jetzt <Text bold>cdk/lib/workshop-stack.ts</Text> in deinem Editor!</Text>
          <Text dimColor>   Drücke <Text color="cyan" bold>[w]</Text> wenn du die Datei offen hast → Quiz</Text>
        </Box>
      </Box>
    </Box>
  );

  // Step 2: Eine Lambda verstehen
  const renderStep2Learning = () => (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">🔍 Eine Lambda verstehen</Text>
      </Box>
      <Text dimColor>Schaue dir GetTableListLambda an - die 4 wichtigen Teile:</Text>
      <Box marginY={1}>
        <CodeSnippet
          language="typescript"
          showLineNumbers={true}
          code={`const lambda = new nodejs.NodejsFunction(this, 'Name', {
  functionName: 'Name',              // [1] Name in AWS
  entry: 'packages/.../handler.ts',  // [2] Dein Code
  environment: { ... },              // [3] Config (DB, Queues)
});
queue.grantSendMessages(lambda);     // [4] Permissions`}
        />
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text><Text color="green" bold>[1] functionName</Text> - So heißt die Lambda in AWS</Text>
        <Text><Text color="green" bold>[2] entry</Text> - Pfad zu deinem TypeScript Handler</Text>
        <Text><Text color="green" bold>[3] environment</Text> - Umgebungsvariablen (DB-Connection etc.)</Text>
        <Text><Text color="green" bold>[4] grant*</Text> - IAM Permissions (wer darf was)</Text>
      </Box>
    </Box>
  );

  // Step 3: Environment Variables
  const renderStep3Learning = () => (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">🐳 Environment Variables & Docker</Text>
      </Box>
      <Text dimColor>Lambdas laufen IN Docker (LocalStack). Wichtig:</Text>
      <Box marginY={1}>
        <CodeSnippet
          language="typescript"
          showLineNumbers={false}
          code={`const lambdaEnvironment = {
  DB_HOST: 'postgres',  // Docker-Name, NICHT localhost!
  DB_PORT: '5432',
  LTS_WORKER_QUEUE_URL: ltsWorkerQueue.queueUrl,  // CDK injiziert!
};`}
        />
      </Box>
      <Box flexDirection="column" borderStyle="single" borderColor="yellow" padding={1} marginY={1}>
        <Text bold color="yellow">⚠️ Warum 'postgres' statt 'localhost'?</Text>
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Lambda läuft in Container A (LocalStack)</Text>
          <Text dimColor>Postgres läuft in Container B</Text>
          <Text dimColor>→ localhost = "ich selbst" = Container A</Text>
          <Text color="green">→ 'postgres' = Docker-Netzwerk-Name = Container B ✓</Text>
        </Box>
      </Box>
    </Box>
  );

  // Step 4: Permissions mit grant
  const renderStep4Learning = () => (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">🔐 Permissions mit grant()</Text>
      </Box>
      <Text dimColor>AWS "Least Privilege": Lambda bekommt nur was sie braucht.</Text>
      <Box marginY={1}>
        <CodeSnippet
          language="typescript"
          showLineNumbers={false}
          code={`// Senden erlauben
queue.grantSendMessages(lambda);

// Lesen erlauben
queue.grantConsumeMessages(lambda);

// Beides (für Worker die sich selbst triggern)
queue.grantSendMessages(lambda);
queue.grantConsumeMessages(lambda);`}
        />
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text bold color="yellow">Pattern merken:</Text>
        <Text>  <Text color="cyan">resource.grant*(lambda)</Text></Text>
      </Box>
      <Box borderStyle="single" borderColor="green" padding={1} marginTop={1}>
        <Box flexDirection="column">
          <Text bold color="green">✓ GetTableListLambda braucht keine Queue-Permissions</Text>
          <Text dimColor>  Sie liest nur aus der Datenbank.</Text>
        </Box>
      </Box>
    </Box>
  );

  // Step 5: Erstes Deploy (Bootstrap + Deploy)
  const renderStep5Learning = () => (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">🚀 Erstes Deploy - DU machst es!</Text>
      </Box>
      <Text>Jetzt wird's ernst: Du bootstrapst und deployest deinen ersten CDK Stack.</Text>
      <Box marginY={1} flexDirection="column">
        <Text bold>Was passiert:</Text>
        <Text dimColor>  1. <Text color="yellow">Bootstrap</Text> - Erstellt CDK-Hilfsbucket in LocalStack (einmalig)</Text>
        <Text dimColor>  2. <Text color="yellow">Deploy</Text> - CDK kompiliert → CloudFormation → LocalStack</Text>
        <Text dimColor>  3. LocalStack erstellt Queue + Lambda</Text>
      </Box>
      <Box marginY={1} borderStyle="single" borderColor="cyan" padding={1}>
        <Box flexDirection="column">
          <Text bold>Öffne ein neues Terminal und führe aus:</Text>
          <Box marginY={1} flexDirection="column">
            <Text bold color="cyan">cd cdk</Text>
            <Text bold color="cyan">npx cdklocal bootstrap</Text>
            <Text bold color="cyan">npx cdklocal deploy --require-approval never</Text>
          </Box>
          <Text dimColor>Bootstrap: ~10s, Deploy: ~30s</Text>
        </Box>
      </Box>
    </Box>
  );

  // Shuffle quiz options once per step change (memoized)
  const shuffledQuizOptions = useMemo(() => {
    const quiz = quizzes[step];
    if (!quiz) return null;
    return shuffleArray(quiz.options);
  }, [step]);

  // Render quiz for current step
  const renderQuiz = () => {
    const quiz = quizzes[step];
    if (!quiz || !shuffledQuizOptions) return null;

    return (
      <Box flexDirection="column">
        <Box borderStyle="single" borderColor="magenta" padding={1} marginBottom={1}>
          <Text bold color="magenta">🎯 Verständnis-Check</Text>
        </Box>
        <SelectPrompt
          message={quiz.question}
          choices={shuffledQuizOptions}
          onSelect={handleQuizAnswer}
        />
      </Box>
    );
  };

  // Render passed state
  const renderPassed = () => {
    const quiz = quizzes[step];

    if (step === 5) {
      // Step 5: Deploy success
      return (
        <Box flexDirection="column">
          <Box borderStyle="double" borderColor="green" padding={1}>
            <Box flexDirection="column" alignItems="center" width="100%">
              <Text bold color="green">✅ GetTableListLambda ist deployed!</Text>
              <Box marginY={1}>
                <Text>Dein erster CDK Deploy war erfolgreich!</Text>
              </Box>
              <Text dimColor>Du kannst jetzt Lambdas definieren und deployen.</Text>
            </Box>
          </Box>
        </Box>
      );
    }

    // Quiz passed
    return (
      <Box flexDirection="column">
        <Box borderStyle="double" borderColor="green" padding={1}>
          <Box flexDirection="column">
            <Text bold color="green">✅ Richtig!</Text>
            <Box marginTop={1}>
              <Text>{quiz?.explanation}</Text>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  };

  // Render failed state
  const renderFailed = () => {
    const quiz = quizzes[step];

    return (
      <Box flexDirection="column">
        <Box borderStyle="single" borderColor="red" padding={1} marginBottom={1}>
          <Box flexDirection="column">
            <Text bold color="red">❌ Nicht ganz richtig</Text>
            <Box marginTop={1}>
              <Text dimColor>Schau dir den Inhalt nochmal an!</Text>
            </Box>
          </Box>
        </Box>
        <SelectPrompt
          message="Was möchtest du tun?"
          choices={[
            { label: 'Nochmal lesen', value: 'learn' },
            { label: 'Quiz wiederholen', value: 'retry' },
          ]}
          onSelect={(v) => {
            if (v === 'learn') {
              setStepState('learning');
              setQuizAnswer(null);
            } else {
              retryQuiz();
            }
          }}
        />
      </Box>
    );
  };

  // Render deploy waiting (Step 5)
  const renderDeployWaiting = () => {
    const dots = '.'.repeat((pollCount % 3) + 1);

    return (
      <Box flexDirection="column">
        <Box borderStyle="single" borderColor="yellow" padding={1}>
          <Box flexDirection="column">
            <Text bold color="yellow">⏳ Warte auf Deploy{dots}</Text>
            <Box marginY={1} flexDirection="column">
              <Text>Führe in einem anderen Terminal aus:</Text>
              <Box marginY={1} borderStyle="single" borderColor="cyan" paddingX={2} flexDirection="column">
                <Text bold color="cyan">cd cdk</Text>
                <Text bold color="cyan">npx cdklocal bootstrap</Text>
                <Text bold color="cyan">npx cdklocal deploy --require-approval never</Text>
              </Box>
            </Box>
            <Text dimColor>Ich prüfe alle 2 Sekunden ob GetTableListLambda existiert...</Text>
            {pollCount > 5 && (
              <Box marginTop={1}>
                <Text color="yellow">💡 Falls es fehlschlägt, prüfe ob LocalStack läuft!</Text>
              </Box>
            )}
          </Box>
        </Box>
        <Box marginTop={1}>
          <SelectPrompt
            message=""
            choices={[
              { label: 'Abbrechen (zurück)', value: 'cancel' },
            ]}
            onSelect={() => {
              setDeployWaiting(false);
              setPollCount(0);
              setStepState('learning');
            }}
          />
        </Box>
      </Box>
    );
  };

  // Learning content for each step
  const learningContent: Record<TutorialStep, () => React.ReactNode> = {
    1: renderStep1Learning,
    2: renderStep2Learning,
    3: renderStep3Learning,
    4: renderStep4Learning,
    5: renderStep5Learning,
  };

  const stepTitles: Record<TutorialStep, string> = {
    1: 'Wo ist die Infrastruktur?',
    2: 'Eine Lambda verstehen',
    3: 'Environment Variables',
    4: 'Permissions mit grant',
    5: 'Erstes Deploy',
  };

  // Render content based on current state
  const renderContent = () => {
    if (deployWaiting) {
      return renderDeployWaiting();
    }

    switch (stepState) {
      case 'learning':
        return learningContent[step]();
      case 'quiz':
        return renderQuiz();
      case 'passed':
        return renderPassed();
      case 'failed':
        return renderFailed();
      default:
        return learningContent[step]();
    }
  };

  // Footer hotkey hints
  const renderFooter = () => {
    if (deployWaiting) return null;

    const isLastStep = step === 5;
    const canGoBack = step > 1 && stepState === 'learning';

    let nextLabel = '';
    if (stepState === 'learning') {
      nextLabel = step === 5 ? ' Deploy starten' : ' Quiz →';
    } else if (stepState === 'passed') {
      nextLabel = isLastStep ? ' Fertig → Phase 1' : ' Weiter →';
    }

    return (
      <Box
        borderStyle="single"
        borderTop
        borderLeft={false}
        borderRight={false}
        borderBottom={false}
        borderColor="gray"
        flexShrink={0}
        paddingY={0}
        gap={2}
      >
        {(stepState === 'learning' || stepState === 'passed') && (
          <Text>
            <Text color="cyan" bold>[w]</Text>
            <Text dimColor>{nextLabel}</Text>
          </Text>
        )}
        {canGoBack && (
          <Text>
            <Text color="cyan" bold>[z]</Text>
            <Text dimColor> Zurück</Text>
          </Text>
        )}
        <Box flexGrow={1} />
        <Text dimColor>
          {step}/5
        </Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* HEADER */}
      <Box
        justifyContent="space-between"
        marginBottom={1}
        borderStyle="single"
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderColor="gray"
        flexShrink={0}
      >
        <Text bold color="blue">🎓 Phase 0: CDK Grundlagen</Text>
        <Box>
          {[1, 2, 3, 4, 5].map((s) => (
            <Text key={s} color={s === step ? 'cyan' : s < step ? 'green' : 'gray'}>
              {s === step ? ' ● ' : s < step ? ' ✓ ' : ' ○ '}
            </Text>
          ))}
        </Box>
      </Box>

      {/* BODY */}
      <Box flexGrow={1} flexDirection="column">
        <Box marginBottom={1} flexShrink={0}>
          <Text bold underline color="magenta">
            Schritt {step}: {stepTitles[step]}
          </Text>
          {stepState === 'quiz' && (
            <Text color="yellow"> (Verständnis-Check)</Text>
          )}
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          {renderContent()}
        </Box>
      </Box>

      {/* FOOTER */}
      {renderFooter()}
    </Box>
  );
};
