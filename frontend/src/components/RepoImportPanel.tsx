import { useCallback, useRef, useState } from 'react';
import {
  FileUp,
  Link2,
  Loader2,
  Plug,
} from 'lucide-react';
import { useAiBridge } from '../hooks/useAiBridge';
import {
  AI_PROVIDERS,
  getSavedProvider,
  saveProvider,
  type AiProvider,
} from '../utils/aiProviders';
import {
  buildRepoImportFromPdfPrompt,
  buildRepoImportFromProfileTextPrompt,
} from '../utils/aiPrompt';
import { readPdfFileAsBase64 } from '../utils/pdf';
import type { RepoItem } from '../types/repository';
import {
  applyRepoImportMerge,
  flattenImportPayload,
  parseRepoImportResponse,
} from '../utils/repoImport';
import './RepoImportPanel.css';

interface RepoImportPanelProps {
  onComplete?: () => void;
}

type ImportTab = 'resume' | 'linkedin';

export function RepoImportPanel({ onComplete }: RepoImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ImportTab>('resume');
  const [provider, setProvider] = useState<AiProvider>(getSavedProvider);
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [linkedInUrl, setLinkedInUrl] = useState('');
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { bridgeReady, sendPdfAndWait, sendPromptAndWait, scrapeUrlAndWait } =
    useAiBridge();

  const handlePdfChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter(
      (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'),
    );
    setPdfFiles(files);
    setError(null);
  };

  const runImport = useCallback(async () => {
    if (!bridgeReady) {
      setError('Extension required. Reload extension, then refresh this page (Cmd+R).');
      return;
    }

    setWorking(true);
    setError(null);
    setStatus(null);

    try {
      let totalCreated = 0;
      let totalMerged = 0;
      let totalSkipped = 0;
      let totalOngoingCreated = 0;
      let totalOngoingUpdated = 0;
      let totalOngoingSkipped = 0;
      let totalEducationCreated = 0;
      let totalEducationMerged = 0;
      let totalEducationSkipped = 0;

      const reloadExisting = async (): Promise<RepoItem[]> => {
        const res = await fetch('/api/repo');
        if (!res.ok) throw new Error('Failed to load repository entries.');
        return res.json();
      };

      let workingItems = await reloadExisting();

      if (tab === 'resume') {
        if (pdfFiles.length === 0) {
          throw new Error('Choose one or more PDF resumes to import.');
        }

        for (let index = 0; index < pdfFiles.length; index += 1) {
          const file = pdfFiles[index];
          setStatus(`Extracting ${index + 1}/${pdfFiles.length}: ${file.name}…`);

          const { base64, filename } = await readPdfFileAsBase64(file);
          const response = await sendPdfAndWait({
            provider,
            prompt: buildRepoImportFromPdfPrompt(filename),
            pdfBase64: base64,
            filename,
            forceNewChat: true,
          });

          const payload = parseRepoImportResponse(response.rawResponse!);
          const entries = flattenImportPayload(payload);
          const result = await applyRepoImportMerge(
            workingItems,
            entries,
            payload.source_label ?? filename,
            payload.profile,
          );

          totalCreated += result.created;
          totalMerged += result.merged;
          totalSkipped += result.skipped;
          totalOngoingCreated += result.ongoingCreated;
          totalOngoingUpdated += result.ongoingUpdated;
          totalOngoingSkipped += result.ongoingSkipped;
          totalEducationCreated += result.educationCreated;
          totalEducationMerged += result.educationMerged;
          totalEducationSkipped += result.educationSkipped;

          workingItems = await reloadExisting();
        }
      } else {
        const url = linkedInUrl.trim();
        if (!url) {
          throw new Error('Paste a LinkedIn profile URL.');
        }

        setStatus('Reading LinkedIn profile…');
        const scraped = await scrapeUrlAndWait(url);

        setStatus('Extracting profile via Web AI…');
        const response = await sendPromptAndWait({
          provider,
          prompt: buildRepoImportFromProfileTextPrompt(
            scraped.text,
            scraped.title,
          ),
        });

        const payload = parseRepoImportResponse(response.rawResponse!);
        const entries = flattenImportPayload({
          ...payload,
          source_label: payload.source_label ?? 'LinkedIn',
        });
        const result = await applyRepoImportMerge(
          workingItems,
          entries,
          payload.source_label ?? 'LinkedIn',
          payload.profile,
        );

        totalCreated += result.created;
        totalMerged += result.merged;
        totalSkipped += result.skipped;
        totalOngoingCreated += result.ongoingCreated;
        totalOngoingUpdated += result.ongoingUpdated;
        totalOngoingSkipped += result.ongoingSkipped;
        totalEducationCreated += result.educationCreated;
        totalEducationMerged += result.educationMerged;
        totalEducationSkipped += result.educationSkipped;
      }

      const ongoingSummary =
        totalOngoingCreated + totalOngoingUpdated + totalOngoingSkipped > 0
          ? ` Ongoing: ${totalOngoingCreated} linked, ${totalOngoingUpdated} updated, ${totalOngoingSkipped} skipped.`
          : '';

      const educationSummary =
        totalEducationCreated + totalEducationMerged + totalEducationSkipped > 0
          ? ` Education: ${totalEducationCreated} new, ${totalEducationMerged} merged, ${totalEducationSkipped} skipped.`
          : '';

      setStatus(
        `Done — ${totalCreated} new, ${totalMerged} merged, ${totalSkipped} skipped (duplicates). All saved as freewrite.${ongoingSummary}${educationSummary}`,
      );
      setPdfFiles([]);
      setLinkedInUrl('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
      setStatus(null);
    } finally {
      setWorking(false);
    }
  }, [
    bridgeReady,
    linkedInUrl,
    onComplete,
    pdfFiles,
    provider,
    scrapeUrlAndWait,
    sendPromptAndWait,
    sendPdfAndWait,
    tab,
  ]);

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn--secondary repo-import-toggle"
        onClick={() => setOpen(true)}
      >
        Import
      </button>
    );
  }

  return (
    <div className="card repo-import-panel">
      <div className="repo-import-header">
        <div>
          <h2 className="repo-import-title">Import into repository</h2>
          <p className="repo-import-sub">
            Extracts experiences and projects as <strong>freewrite</strong> repository
            entries. Education (school, GPA, major, coursework) goes to the{' '}
            <strong>Education Info</strong> tab. Matches existing items and{' '}
            <em>appends</em> new content — never overwrites. Current roles/projects
            are also linked on Ongoing.
          </p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      <div className="repo-import-tabs">
        <button
          type="button"
          className={`repo-import-tab${tab === 'resume' ? ' repo-import-tab--active' : ''}`}
          onClick={() => setTab('resume')}
        >
          <FileUp size={14} />
          Resume PDF(s)
        </button>
        <button
          type="button"
          className={`repo-import-tab${tab === 'linkedin' ? ' repo-import-tab--active' : ''}`}
          onClick={() => setTab('linkedin')}
        >
          <Link2 size={14} />
          LinkedIn URL
        </button>
      </div>

      <div className="repo-import-controls">
        <label className="field repo-import-field">
          <span>Web AI provider</span>
          <select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value as AiProvider);
              saveProvider(e.target.value as AiProvider);
            }}
            disabled={working}
          >
            {AI_PROVIDERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {tab === 'resume' ? (
        <div className="repo-import-body">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="repo-import-file-input"
            onChange={handlePdfChange}
            disabled={working}
          />
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={working}
          >
            <FileUp size={14} />
            {pdfFiles.length > 0
              ? `${pdfFiles.length} PDF${pdfFiles.length === 1 ? '' : 's'} selected`
              : 'Choose PDF resume(s)'}
          </button>
          {pdfFiles.length > 0 ? (
            <ul className="repo-import-file-list">
              {pdfFiles.map((file) => (
                <li key={`${file.name}-${file.size}`}>{file.name}</li>
              ))}
            </ul>
          ) : null}
          <p className="repo-import-hint">
            Upload multiple resumes to pull in more experiences. Each file is extracted
            separately, then merged without overwriting existing entries.
          </p>
        </div>
      ) : (
        <div className="repo-import-body">
          <label className="field">
            <span>LinkedIn profile URL</span>
            <input
              type="url"
              value={linkedInUrl}
              onChange={(e) => setLinkedInUrl(e.target.value)}
              placeholder="https://www.linkedin.com/in/your-handle/"
              disabled={working}
            />
          </label>
          <p className="repo-import-hint">
            You must be logged into LinkedIn in Chrome. The extension opens your profile
            in a background tab and extracts visible text for Web AI parsing.
          </p>
        </div>
      )}

      {!bridgeReady ? (
        <p className="repo-import-warning">
          <Plug size={13} />
          Install/reload the Chrome extension, then refresh this page.
        </p>
      ) : null}

      {status ? <p className="repo-import-status">{status}</p> : null}
      {error ? <p className="repo-import-error">{error}</p> : null}

      <div className="repo-import-actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={runImport}
          disabled={
            working ||
            !bridgeReady ||
            (tab === 'resume' ? pdfFiles.length === 0 : !linkedInUrl.trim())
          }
        >
          {working ? <Loader2 size={14} className="spin" /> : null}
          {working ? 'Importing…' : 'Extract & merge into repository'}
        </button>
      </div>
    </div>
  );
}
