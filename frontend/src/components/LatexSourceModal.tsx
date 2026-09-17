import { useEffect, useState } from 'react';
import { X, Copy, Check, Download, ExternalLink } from 'lucide-react';
import { saveBlob } from '../utils/latex';
import './LatexSourceModal.css';

interface LatexSourceModalProps {
  open: boolean;
  tex: string;
  /** Suggested filename for the .tex download, e.g. "Alex_Candidate_Resume.tex". */
  filename: string;
  onClose: () => void;
}

/**
 * Read-only view of the LaTeX source that Download PDF compiles. Copy it,
 * save it as .tex, or push it straight into a new Overleaf project.
 */
export function LatexSourceModal({ open, tex, filename, onClose }: LatexSourceModalProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tex);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked; the text is still selectable below.
    }
  };

  const download = () => {
    saveBlob(new Blob([tex], { type: 'application/x-tex' }), filename);
  };

  return (
    <div className="latex-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="latex-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="latex-modal-title"
      >
        <div className="latex-modal-header">
          <div>
            <h2 id="latex-modal-title" className="latex-modal-title">LaTeX source</h2>
            <p className="latex-modal-copy">
              This is exactly what Download PDF compiles. Paste it into Overleaf as{' '}
              <code>main.tex</code> to edit the resume in LaTeX directly.
            </p>
          </div>
          <button type="button" className="latex-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="latex-modal-actions">
          <button type="button" className="latex-modal-btn" onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className="latex-modal-btn" onClick={download}>
            <Download size={14} />
            Download .tex
          </button>
          {/* Overleaf's "open in" endpoint takes a POSTed snippet and creates a
              fresh project from it. A form is the only way to POST to another
              origin and land on the resulting page. */}
          <form method="post" action="https://www.overleaf.com/docs" target="_blank" className="latex-modal-form">
            <input type="hidden" name="encoded_snip" value={encodeURIComponent(tex)} />
            <input type="hidden" name="snip_name" value={filename} />
            <input type="hidden" name="engine" value="pdflatex" />
            <button type="submit" className="latex-modal-btn latex-modal-btn--primary">
              <ExternalLink size={14} />
              Open in Overleaf
            </button>
          </form>
        </div>

        <pre className="latex-modal-source" tabIndex={0}>{tex}</pre>
      </div>
    </div>
  );
}
