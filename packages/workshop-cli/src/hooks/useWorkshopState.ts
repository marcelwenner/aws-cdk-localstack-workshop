import { useState, useEffect } from 'react';
import { StateManager, type WorkshopState } from '../core/state/workshop-state.js';

const stateManager = new StateManager();

export function useWorkshopState() {
  const [state, setState] = useState<WorkshopState>({
    currentPhase: 0,
    completedPhases: [],
    completedQuizzes: [],
    quizResults: [],
    hintProgress: {},
    phasesWithAllHintsSeen: [],
    startTime: new Date().toISOString(),
    lastCommand: '',
  });

  const [loading, setLoading] = useState(true);

  // Load state on mount
  useEffect(() => {
    async function loadState() {
      const loadedState = await stateManager.loadState();
      setState(loadedState);
      setLoading(false);
    }

    loadState();
  }, []);

  const setPhase = async (phase: number) => {
    // Update local state immediately for UI responsiveness
    setState(prev => ({ ...prev, currentPhase: phase }));
    // Use updateState to avoid stale closure - it reads fresh state from file
    await stateManager.updateState(prev => ({ ...prev, currentPhase: phase }));
  };

  const markPhaseComplete = async (phase: number) => {
    // Complete the phase timer first (record duration)
    await stateManager.completePhaseTimer(phase);
    // Then mark the phase as complete
    await stateManager.markPhaseComplete(phase);
    const newState = await stateManager.loadState();
    setState(newState);
  };

  const resetWorkshop = async () => {
    const newState: WorkshopState = {
      currentPhase: 0,
      completedPhases: [],
      completedQuizzes: [],
      quizResults: [],
      hintProgress: {},
      phasesWithAllHintsSeen: [],
      startTime: new Date().toISOString(),
      lastCommand: '',
    };
    setState(newState);
    await stateManager.saveState(newState);
  };

  return {
    state,
    loading,
    currentPhase: state.currentPhase,
    completedPhases: state.completedPhases,
    setPhase,
    markPhaseComplete,
    resetWorkshop,
  };
}
