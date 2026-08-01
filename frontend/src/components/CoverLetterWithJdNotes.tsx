import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CoverLetterData } from '../types/coverLetter';
import { collectCoverLetterJdNotes } from '../utils/jdNotes';
import type { CoverLetterRenderSettings } from '../utils/coverLetterSettings';
import { JdNotesPanel } from './JdNotesPanel';
import { CoverLetterDocument } from './CoverLetterDocument';
import './JdNotesPanel.css';

/**
 * Cover letter counterpart of `ResumeWithJdNotes`, deliberately identical in
 * behavior so the two documents feel like one app. The panel is a SIBLING of
 * the page wrapper, never a child: `pdf.ts` resolves its export root by
 * climbing to `.resume-page-wrapper` and measures page fit from the page
 * element's own scrollHeight, so notes rendered inside the page would both
 * print and corrupt the one-page fit reading.
 */
interface CoverLetterWithJdNotesProps {
  data: CoverLetterData;
  onChange: (data: CoverLetterData, immediateHistory?: boolean) => void;
  editing?: boolean;
  id?: string;
  showJdNotes?: boolean;
  settings?: CoverLetterRenderSettings;
}

export function CoverLetterWithJdNotes({
  data,
  onChange,
  editing = true,
  id = 'cover-letter-document',
  showJdNotes = false,
  settings,
}: CoverLetterWithJdNotesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const notes = useMemo(() => collectCoverLetterJdNotes(data), [data]);
  const showPanel = showJdNotes && notes.length > 0;
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
      <CoverLetterDocument
        data={data}
        onChange={onChange}
        editing={editing}
        id={id}
        settings={settings}
        showJdNotes={showJdNotes}
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
