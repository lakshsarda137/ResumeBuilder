import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Bold, Italic } from 'lucide-react';
import {
  applyStyleToRange,
  cloneRange,
  getEditableSelectionRange,
  restoreRangeInEditable,
} from '../utils/formatSelection';
import './FormatToolbar.css';

interface FormatToolbarProps {
  /**
   * `dock` — the editor's own bar: full width, part of the fixed chrome above
   * the scrolling canvas, so it never moves and never overlaps the document.
   * `canvas` — a tab attached to the top of a preview page, for the result
   * modal where the stack is static and the bar is genuinely a page header.
   * The editor used to use `canvas` and had to make it sticky to stay
   * reachable, which meant it floated over the résumé and hid the top of it.
   */
  variant?: 'header' | 'dock' | 'canvas';
  trailing?: ReactNode;
  showControls?: boolean;
  hint?: string;
}

const FONT_OPTIONS = [
  'Times New Roman',
  'Arial',
  'Georgia',
  'Calibri',
  'Helvetica',
  'Garamond',
] as const;

const SIZE_OPTIONS = [
  { label: '9 pt', value: '9pt' },
  { label: '10 pt', value: '10pt' },
  { label: '10.5 pt', value: '10.5pt' },
  { label: '11 pt', value: '11pt' },
  { label: '12 pt', value: '12pt' },
  { label: '14 pt', value: '14pt' },
] as const;

const FONT_FALLBACKS: Record<(typeof FONT_OPTIONS)[number], string> = {
  'Times New Roman': 'serif',
  Arial: 'sans-serif',
  Georgia: 'serif',
  Calibri: 'sans-serif',
  Helvetica: 'sans-serif',
  Garamond: 'serif',
};

function isEditableFocused(): boolean {
  const el = document.activeElement;
  return (
    el instanceof HTMLElement &&
    el.isContentEditable &&
    el.closest('.editor-canvas') !== null
  );
}

export function FormatToolbar({
  variant = 'header',
  trailing,
  showControls = true,
  hint = 'Select resume text, then pick font or size',
}: FormatToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [active, setActive] = useState({ bold: false, italic: false });
  const [canFormat, setCanFormat] = useState(false);
  const [fontFamily, setFontFamily] = useState<string>(FONT_OPTIONS[0]);
  const [fontSize, setFontSize] = useState<string>('10.5pt');

  const syncSavedSelection = useCallback(() => {
    const live = getEditableSelectionRange();
    if (live && !live.collapsed) {
      savedRangeRef.current = cloneRange(live);
      setCanFormat(true);
      return;
    }

    if (savedRangeRef.current && !savedRangeRef.current.collapsed) {
      setCanFormat(true);
      return;
    }

    setCanFormat(false);
  }, []);

  const refreshCommandState = useCallback(() => {
    if (isEditableFocused()) {
      setActive({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
      });
    }
    syncSavedSelection();
  }, [syncSavedSelection]);

  useEffect(() => {
    const onSelectionChange = () => {
      if (isEditableFocused()) {
        refreshCommandState();
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof Node && toolbarRef.current?.contains(target)) {
        return;
      }
      refreshCommandState();
    };

    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [refreshCommandState]);

  const runWithSavedRange = useCallback(
    (apply: (range: Range) => Range | null) => {
      const saved = savedRangeRef.current;
      if (!saved || saved.collapsed) {
        return false;
      }

      if (!restoreRangeInEditable(saved)) {
        return false;
      }

      const live = getEditableSelectionRange();
      if (!live || live.collapsed) {
        return false;
      }

      const next = apply(live);
      if (!next) {
        return false;
      }

      savedRangeRef.current = next;
      return true;
    },
    [],
  );

  const exec = (command: string) => {
    if (savedRangeRef.current && !savedRangeRef.current.collapsed) {
      restoreRangeInEditable(savedRangeRef.current);
    } else if (!isEditableFocused()) {
      return;
    }

    document.execCommand(command, false);

    const live = getEditableSelectionRange();
    if (live) {
      savedRangeRef.current = cloneRange(live);
    }

    refreshCommandState();
  };

  const applyFontFamily = (font: string) => {
    const match = FONT_OPTIONS.find((option) => option === font);
    if (!match) {
      return;
    }

    const ok = runWithSavedRange((range) =>
      applyStyleToRange(range, {
        fontFamily: `"${match}", ${FONT_FALLBACKS[match]}`,
      }),
    );

    if (ok) {
      setFontFamily(match);
    }
  };

  const applyFontSizeValue = (size: string) => {
    const ok = runWithSavedRange((range) =>
      applyStyleToRange(range, { fontSize: size }),
    );

    if (ok) {
      setFontSize(size);
    }
  };

  const stashSelectionForDropdown = () => {
    const live = getEditableSelectionRange();
    if (live && !live.collapsed) {
      savedRangeRef.current = cloneRange(live);
      setCanFormat(true);
    }
  };

  return (
    <div
      ref={toolbarRef}
      className={`format-toolbar${canFormat ? ' format-toolbar--active' : ''}${variant !== 'header' ? ` format-toolbar--${variant}` : ''}`}
      role="toolbar"
      aria-label="Text formatting"
    >
      {showControls ? (
        <>
          <span className="format-toolbar-label">Format</span>
          <button
            type="button"
            className={`format-btn${active.bold ? ' format-btn--active' : ''}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => exec('bold')}
            title="Bold"
            disabled={!canFormat}
          >
            <Bold size={14} />
          </button>
          <button
            type="button"
            className={`format-btn${active.italic ? ' format-btn--active' : ''}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => exec('italic')}
            title="Italic"
            disabled={!canFormat}
          >
            <Italic size={14} />
          </button>
          <select
            className="format-select"
            value={fontFamily}
            onPointerDown={stashSelectionForDropdown}
            onChange={(event) => applyFontFamily(event.target.value)}
            disabled={!canFormat}
            title="Font family"
          >
            {FONT_OPTIONS.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
          <select
            className="format-select format-select--size"
            value={fontSize}
            onPointerDown={stashSelectionForDropdown}
            onChange={(event) => applyFontSizeValue(event.target.value)}
            disabled={!canFormat}
            title="Font size"
          >
            {SIZE_OPTIONS.map(({ label, value }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </>
      ) : null}
      {!canFormat && showControls ? (
        <span className="format-toolbar-hint">{hint}</span>
      ) : null}
      {!showControls ? (
        <span className="format-toolbar-hint">{hint}</span>
      ) : null}
      {trailing ? <div className="format-toolbar-trailing">{trailing}</div> : null}
    </div>
  );
}
