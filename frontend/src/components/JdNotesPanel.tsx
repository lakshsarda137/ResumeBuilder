import type { JdNote } from '../utils/jdNotes';
import './JdNotesPanel.css';

interface JdNotesPanelProps {
  notes: JdNote[];
  activeNoteId: string | null;
  pinnedNoteId: string | null;
  onNoteHover: (noteId: string | null) => void;
  onNoteClick: (noteId: string) => void;
}

export function JdNotesPanel({
  notes,
  activeNoteId,
  pinnedNoteId,
  onNoteHover,
  onNoteClick,
}: JdNotesPanelProps) {
  return (
    <aside className="jd-notes-panel" aria-label="Job description match notes">
      <p className="jd-notes-panel-heading">JD match notes</p>
      <p className="jd-notes-panel-sub">
        Hover or click a note to highlight the match on your resume. Not included
        in PDF export.
      </p>
      <div className="jd-notes-panel-list">
        {notes.map((note) => {
          const isActive = activeNoteId === note.id;
          const isPinned = pinnedNoteId === note.id;

          return (
            <button
              key={note.id}
              type="button"
              className={`jd-note-card${isActive ? ' jd-note-card--active' : ''}${isPinned ? ' jd-note-card--pinned' : ''}`}
              onMouseEnter={() => onNoteHover(note.id)}
              onMouseLeave={() => onNoteHover(null)}
              onClick={() => onNoteClick(note.id)}
            >
              <span className="jd-note-label">{note.label}</span>
              <p className="jd-note-text">{note.comment}</p>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
