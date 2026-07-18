import { ReactNode } from 'react';

export interface TutorialSection {
  title: string;
  content: ReactNode;
}

export interface TutorialHint {
  level: number;
  title: string;
  content: string;
}

export interface PhaseTutorial {
  phase: number;
  title: string;
  learningObjectives: string[];
  architecture?: string; // ASCII diagram
  sections: TutorialSection[];
  hints: TutorialHint[];
  testingTips: string[];
}
