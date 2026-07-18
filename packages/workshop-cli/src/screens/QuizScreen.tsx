import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import { QuizHeader } from '../components/quiz/QuizHeader.js';
import { FeedbackPanel } from '../components/quiz/FeedbackPanel.js';
import { SelectPrompt } from '../components/prompts/SelectPrompt.js';
import type { PhaseQuiz, QuizQuestion } from '../core/config/workshop.config.js';
import type { QuizResult, QuizAnswer } from '../core/state/workshop-state.js';

export interface QuizScreenProps {
  phase: number;
  quiz: PhaseQuiz;
  onComplete: (result: QuizResult) => void;
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
 * Question with shuffled answers and updated correct index
 */
interface ShuffledQuestion extends QuizQuestion {
  shuffledOptions: string[];
  shuffledCorrectAnswer: number;
}

/**
 * Randomly select N questions from the pool and shuffle their answers
 */
function selectRandomQuestions(pool: QuizQuestion[], count: number): ShuffledQuestion[] {
  const shuffledQuestions = shuffleArray(pool).slice(0, count);

  // Shuffle answers for each question and track the new correct index
  return shuffledQuestions.map(question => {
    // Create array of [originalIndex, option] pairs
    const indexedOptions = question.options.map((opt, idx) => ({ idx, opt }));
    const shuffledIndexed = shuffleArray(indexedOptions);

    // Find where the correct answer ended up
    const newCorrectIndex = shuffledIndexed.findIndex(item => item.idx === question.correctAnswer);

    return {
      ...question,
      shuffledOptions: shuffledIndexed.map(item => item.opt),
      shuffledCorrectAnswer: newCorrectIndex,
    };
  });
}

/**
 * Main quiz orchestrator with timer and state machine
 * Follows the "UI Porn" aesthetic - clean and professional
 */
export const QuizScreen: React.FC<QuizScreenProps> = ({
  phase,
  quiz,
  onComplete
}) => {
  // Randomly select questions once when component mounts
  const selectedQuestions = useMemo(
    () => selectRandomQuestions(quiz.questionPool, quiz.questionsPerQuiz),
    [quiz]
  );

  const [quizStarted, setQuizStarted] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({});
  const [timeRemaining, setTimeRemaining] = useState(quiz.timeLimit);
  const [showingFeedback, setShowingFeedback] = useState(false);
  const [feedbackData, setFeedbackData] = useState<{
    correct: boolean;
    explanation?: string;
    praise?: string;
  } | null>(null);

  const currentQuestion = selectedQuestions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === selectedQuestions.length - 1;

  // Timer countdown (only when quiz has started)
  useEffect(() => {
    if (!quizStarted) return;

    if (timeRemaining <= 0) {
      handleTimeout();
      return;
    }

    const timer = setInterval(() => {
      setTimeRemaining(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining, quizStarted]);

  const handleTimeout = () => {
    // Auto-submit with current answers
    const result = calculateScore(answers);
    onComplete(result);
  };

  // Store the latest answer for when we need to calculate score
  const latestAnswerRef = React.useRef<QuizAnswer | null>(null);

  const handleAnswer = (value: string) => {
    const selectedIndex = parseInt(value);
    const correct = selectedIndex === currentQuestion.shuffledCorrectAnswer;

    // Record answer
    const newAnswer: QuizAnswer = {
      questionId: currentQuestion.id,
      selectedAnswer: selectedIndex,
      correct,
      timeSpent: quiz.timeLimit - timeRemaining
    };

    // Store in ref for immediate access
    latestAnswerRef.current = newAnswer;

    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: newAnswer
    }));

    // Show feedback
    setFeedbackData({
      correct,
      explanation: correct ? undefined : currentQuestion.explanation,
      praise: correct ? (currentQuestion.praise || 'Genau richtig!') : undefined
    });
    setShowingFeedback(true);

    if (correct) {
      // Auto-advance after 1.5s for correct answers
      setTimeout(() => {
        advanceToNextQuestion();
      }, 1500);
    }
  };

  const handleContinue = () => {
    // Manual continue for wrong answers
    advanceToNextQuestion();
  };

  const advanceToNextQuestion = () => {
    setShowingFeedback(false);
    setFeedbackData(null);

    if (isLastQuestion) {
      // Quiz complete - include the latest answer that may not be in state yet
      const finalAnswers = latestAnswerRef.current
        ? { ...answers, [latestAnswerRef.current.questionId]: latestAnswerRef.current }
        : answers;
      const result = calculateScore(finalAnswers);
      onComplete(result);
    } else {
      // Next question
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const calculateScore = (finalAnswers: Record<string, QuizAnswer>): QuizResult => {
    const totalQuestions = selectedQuestions.length;
    const answersList = Object.values(finalAnswers);
    const correctAnswers = answersList.filter(a => a.correct).length;
    const score = Math.round((correctAnswers / totalQuestions) * 100);
    const timeSpent = quiz.timeLimit - timeRemaining;

    return {
      phase,
      score,
      totalQuestions,
      correctAnswers,
      timeSpent,
      completedAt: new Date().toISOString(),
      answers: answersList
    };
  };

  // Show intro screen before quiz starts
  if (!quizStarted) {
    return (
      <Box flexDirection="column" width="100%" alignItems="center" justifyContent="center">
        <Box
          flexDirection="column"
          alignItems="center"
          borderStyle="double"
          borderColor="magenta"
          padding={2}
          marginY={2}
        >
          <Box marginBottom={1}>
            <Text bold color="magenta">QUIZ BEREIT</Text>
          </Box>

          <Box marginBottom={1}>
            <Text>{quiz.title}</Text>
          </Box>

          <Box flexDirection="column" alignItems="center" marginBottom={1}>
            <Text dimColor>{selectedQuestions.length} Fragen</Text>
            <Text dimColor>Zeit: {Math.floor(quiz.timeLimit / 60)}:{(quiz.timeLimit % 60).toString().padStart(2, '0')} Minuten</Text>
          </Box>

          <Box marginTop={1}>
            <Text bold color="green">Die Fragen werden zufällig ausgewählt!</Text>
          </Box>
        </Box>

        <SelectPrompt
          message="Bereit?"
          choices={[{ label: 'Quiz starten', value: 'start' }]}
          onSelect={() => setQuizStarted(true)}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%">
      {/* Header with timer and progress */}
      <QuizHeader
        phaseTitle={quiz.title}
        currentQuestion={currentQuestionIndex + 1}
        totalQuestions={selectedQuestions.length}
        timeRemaining={timeRemaining}
      />

      {/* Question area */}
      <Box flexDirection="column" marginY={1}>
        {/* Type badge */}
        <Box marginBottom={1}>
          <Text dimColor>
            [{currentQuestion.type === 'multiple-choice' ? 'Multiple Choice' : 'Richtig/Falsch'}]
          </Text>
        </Box>

        {/* Question text */}
        <Box marginBottom={2}>
          <Text bold>{currentQuestion.question}</Text>
        </Box>

        {/* Answer selection or feedback */}
        {!showingFeedback ? (
          <SelectPrompt
            message="Wähle deine Antwort:"
            choices={currentQuestion.shuffledOptions.map((opt, idx) => ({
              label: opt,
              value: idx.toString()
            }))}
            onSelect={handleAnswer}
          />
        ) : (
          <>
            <FeedbackPanel
              correct={feedbackData!.correct}
              explanation={feedbackData!.explanation}
              praise={feedbackData!.praise}
              onContinue={feedbackData!.correct ? undefined : handleContinue}
            />
            {!feedbackData!.correct && (
              <SelectPrompt
                message="Bereit?"
                choices={[{
                  label: isLastQuestion ? 'Quiz abschließen' : 'Nächste Frage',
                  value: 'next'
                }]}
                onSelect={handleContinue}
              />
            )}
          </>
        )}
      </Box>
    </Box>
  );
};
