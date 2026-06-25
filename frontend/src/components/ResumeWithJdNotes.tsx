import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ResumeData } from '../types/resume';
import { collectJdNotes } from '../utils/jdNotes';
import { JdNotesPanel } from './JdNotesPanel';
import { ResumeDocument } from './ResumeDocument';
import './JdNotesPanel.css';

interface ResumeWithJdNotesProps {
  data: ResumeData;
  onChange: (data: ResumeData, immediateHistory?: boolean) => void;
  editing?: boolean;
  id?: string;
  showJdNotes?: boolean;
}

export function ResumeWithJdNotes({
  data,
  onChange,
  editing = true,
  id = 'resume-document',
  showJdNotes = false,
}: ResumeWithJdNotesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const notes = useMemo(() => collectJdNotes(data), [data]);
  const hasNotes = notes.length > 0;
  const showPanel = showJdNotes && hasNotes;
  const [hoverNoteId, setHoverNoteId] = useState<string | null>(null);
  const [pinnedNoteId, setPinnedNoteId] = useState<string | null>(null);
  const activeNoteId = pinnedNoteId ?? hoverNoteId;

  useEffect(() => {
    if (!showPanel) {
      setHoverNoteId(null);
      setPinnedNoteId(null);
    }
  }, [showPanel]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.querySelectorAll('[data-jd-anchor]').forEach((element) => {
      element.classList.remove('jd-anchor--highlighted');
    });

    if (activeNoteId) {
      container
        .querySelector(`[data-jd-anchor="${activeNoteId}"]`)
        ?.classList.add('jd-anchor--highlighted');
    }
  }, [activeNoteId, data, showPanel]);

  const handleNoteClick = useCallback((noteId: string) => {
    setPinnedNoteId((prev) => (prev === noteId ? null : noteId));

    const anchor = containerRef.current?.querySelector<HTMLElement>(
      `[data-jd-anchor="${noteId}"]`,
    );
    anchor?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  return (
    <div
      ref={containerRef}
      className={`resume-with-jd${showPanel ? ' resume-with-jd--show-notes' : ''}`}
    >
      <ResumeDocument
        data={data}
        onChange={onChange}
        editing={editing}
        id={id}
      />
      {showPanel ? (
        <JdNotesPanel
          notes={notes}
          activeNoteId={activeNoteId}
          pinnedNoteId={pinnedNoteId}
          onNoteHover={setHoverNoteId}
          onNoteClick={handleNoteClick}
        />
      ) : null}
    </div>
  );
}
