import { useState, useEffect, useRef } from 'react';
import { join } from 'path';
import chokidar from 'chokidar';
import debounce from 'lodash.debounce';

// Get project root (workshop-cli is at packages/workshop-cli)
const getProjectRoot = () => join(process.cwd(), '..', '..');

export interface FileWatcherOptions {
  paths: readonly string[];
  enabled?: boolean;
  debounceMs?: number; // Default: 800ms (was 2000ms)
  onFileChange?: (path: string) => void;
}

export interface FileWatcherState {
  watching: boolean;
  lastChange?: string;
  changeCount: number;
}

/**
 * Hook to watch files for changes with debouncing
 *
 * Usage:
 * const { watching, lastChange } = useFileWatcher({
 *   paths: ['./packages/lts-executor-lambda/src/**\/*.ts'],
 *   onFileChange: () => runValidation(phase)
 * });
 */
export function useFileWatcher({
  paths,
  enabled = true,
  debounceMs = 800,
  onFileChange
}: FileWatcherOptions): FileWatcherState {
  const [watching, setWatching] = useState(false);
  const [lastChange, setLastChange] = useState<string>();
  const [changeCount, setChangeCount] = useState(0);

  // Use refs to avoid recreating watcher when callbacks change
  const onFileChangeRef = useRef(onFileChange);
  const debounceRef = useRef(debounceMs);

  // Update refs on each render (but don't trigger effect)
  useEffect(() => {
    onFileChangeRef.current = onFileChange;
    debounceRef.current = debounceMs;
  });

  // Stringify paths for stable dependency
  const pathsKey = paths.join('|');

  useEffect(() => {
    if (!enabled || paths.length === 0) {
      setWatching(false);
      return;
    }

    // Resolve paths relative to project root (workshop-cli runs from packages/workshop-cli)
    const projectRoot = getProjectRoot();
    const resolvedPaths = paths.map(p => {
      // Remove leading ./ if present and join with project root
      const cleanPath = p.startsWith('./') ? p.slice(2) : p;
      return join(projectRoot, cleanPath);
    });

    // Create debounced handler that reads from ref
    const debouncedHandler = debounce((path: string) => {
      setLastChange(path);
      setChangeCount(prev => prev + 1);
      onFileChangeRef.current?.(path);
    }, debounceRef.current);

    // Initialize chokidar watcher
    const watcher = chokidar.watch(resolvedPaths, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true, // don't fire events on initial add
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });

    watcher.on('ready', () => {
      setWatching(true);
    });

    watcher.on('change', (path) => {
      debouncedHandler(path);
    });

    watcher.on('add', (path) => {
      debouncedHandler(path);
    });

    watcher.on('error', (error) => {
      console.error('File watcher error:', error);
      setWatching(false);
    });

    // Cleanup
    return () => {
      debouncedHandler.cancel();
      watcher.close();
      setWatching(false);
    };
  }, [pathsKey, enabled]); // Only recreate watcher when paths or enabled changes

  return {
    watching,
    lastChange,
    changeCount
  };
}
