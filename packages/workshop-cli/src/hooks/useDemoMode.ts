import { useState, useCallback } from 'react';
import { useInput } from 'ink';

export interface DemoModeState {
  /** Whether demo mode is active (slower animations) */
  demoMode: boolean;
  /** Toggle demo mode */
  toggleDemoMode: () => void;
  /** Set demo mode explicitly */
  setDemoMode: (value: boolean) => void;
  /** Animation frame interval in ms */
  frameInterval: number;
  /** Particle movement speed (% per frame) */
  particleSpeed: number;
  /** Label to display current mode */
  label: string;
  /** Icon for current mode */
  icon: string;
}

export interface UseDemoModeOptions {
  /** Initial demo mode state */
  initialDemoMode?: boolean;
  /** Key to toggle demo mode (default: 's') */
  toggleKey?: string;
  /** Enable keyboard handler */
  enableKeyboard?: boolean;
}

/**
 * useDemoMode - Controls animation speed for cinematic dashboard
 *
 * Features:
 * - Toggle between Real Speed and Demo Mode
 * - Demo Mode slows animations 4x for educational viewing
 * - Keyboard handler for toggle key
 */
export function useDemoMode(options: UseDemoModeOptions = {}): DemoModeState {
  const {
    initialDemoMode = false,
    toggleKey = 's',
    enableKeyboard = true,
  } = options;

  const [demoMode, setDemoMode] = useState(initialDemoMode);

  const toggleDemoMode = useCallback(() => {
    setDemoMode(prev => !prev);
  }, []);

  // Keyboard handler
  useInput((input) => {
    if (!enableKeyboard) return;
    if (input.toLowerCase() === toggleKey) {
      toggleDemoMode();
    }
  });

  // Calculate animation parameters based on mode
  const frameInterval = demoMode ? 200 : 50;  // 5 FPS vs 20 FPS
  const particleSpeed = demoMode ? 2 : 10;    // 2% vs 10% per frame

  return {
    demoMode,
    toggleDemoMode,
    setDemoMode,
    frameInterval,
    particleSpeed,
    label: demoMode ? 'Demo Mode' : 'Real Speed',
    icon: demoMode ? '🐢' : '⚡',
  };
}

export default useDemoMode;
