import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResumeData } from '../types/resume';
import { defaultResume } from '../data/defaultResume';
import { migrateResumeData } from '../utils/migrateResume';

const STORAGE_KEY = 'resume-editor-data';
const MAX_HISTORY = 50;
const DEBOUNCE_MS = 700;

function snapshotsEqual(a: ResumeData, b: ResumeData) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useResumeState() {
  const [data, setDataState] = useState<ResumeData>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return migrateResumeData(JSON.parse(stored));
      }
    } catch {
      /* use default */
    }
    return defaultResume;
  });

  const [history, setHistory] = useState<ResumeData[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const isUndoingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSnapshotRef = useRef<ResumeData | null>(null);

  const pushSnapshot = useCallback((snapshot: ResumeData) => {
    setHistory((prev) => {
      const last = prev[prev.length - 1];
      if (last && snapshotsEqual(last, snapshot)) {
        return prev;
      }
      return [...prev.slice(-(MAX_HISTORY - 1)), snapshot];
    });
  }, []);

  const flushPendingSnapshot = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (pendingSnapshotRef.current) {
      pushSnapshot(pendingSnapshotRef.current);
      pendingSnapshotRef.current = null;
    }
  }, [pushSnapshot]);

  const setData = useCallback(
    (newData: ResumeData, immediateHistory = false) => {
      setDataState((current) => {
        if (isUndoingRef.current) {
          isUndoingRef.current = false;
          return newData;
        }

        if (!snapshotsEqual(current, newData)) {
          if (immediateHistory) {
            flushPendingSnapshot();
            pushSnapshot(current);
          } else {
            pendingSnapshotRef.current = current;
            if (debounceTimerRef.current) {
              clearTimeout(debounceTimerRef.current);
            }
            debounceTimerRef.current = setTimeout(() => {
              if (pendingSnapshotRef.current) {
                pushSnapshot(pendingSnapshotRef.current);
                pendingSnapshotRef.current = null;
              }
              debounceTimerRef.current = null;
            }, DEBOUNCE_MS);
          }
        }

        return newData;
      });
    },
    [flushPendingSnapshot, pushSnapshot],
  );

  const undo = useCallback(() => {
    flushPendingSnapshot();
    setHistory((prev) => {
      if (prev.length === 0) {
        return prev;
      }
      const previous = prev[prev.length - 1];
      isUndoingRef.current = true;
      setDataState(previous);
      return prev.slice(0, -1);
    });
  }, [flushPendingSnapshot]);

  useEffect(() => {
    setIsSaving(true);
    const timer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setIsSaving(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [data]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isUndo =
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'z' &&
        !event.shiftKey;

      if (isUndo) {
        event.preventDefault();
        undo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const reset = useCallback(() => {
    if (
      window.confirm(
        'Reset resume to the original template? This cannot be undone.',
      )
    ) {
      flushPendingSnapshot();
      setDataState((current) => {
        pushSnapshot(current);
        return defaultResume;
      });
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [flushPendingSnapshot, pushSnapshot]);

  return {
    data,
    setData,
    undo,
    canUndo: history.length > 0,
    reset,
    isSaving,
  };
}
