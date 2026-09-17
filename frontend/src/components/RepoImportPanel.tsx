import { useCallback, useRef, useState } from 'react';
import {
  Check,
  Clipboard,
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
import type { EducationData, EducationItem } from '../types/education';
import {
  applyRepoImportMerge,
  flattenImportPayload,
  parseRepoImportResponse,
} from '../utils/repoImport';
import { PipelineStatus } from './PipelineStatus';
import type {
  RepoImportContradiction,
  RepoImportEducation,
  RepoImportEntry,
  RepoImportMergeDiff,
  RepoImportPayload,
  RepoImportResolutionEntry,
} from '../types/repoImport';
import './ResumeDiffView.css';
import './RepoImportPanel.css';

interface RepoImportPanelProps {
  onComplete?: () => void;
}

type ImportTab = 'resume' | 'linkedin';
type ContradictionChoice = 'existing' | 'incoming';

interface PendingImportBatch {
  sourceLabel: string;
  payload: RepoImportPayload;
}

interface PendingContradiction {
  key: string;
  batchIndex: number;
  contradictionIndex: number;
  sourceLabel: string;
  contradiction: RepoImportContradiction;
}

interface ImportSummary {
  repository: {
    created: number;
    merged: number;
    skipped: number;
  };
  education: {
    created: number;
    merged: number;
    skipped: number;
  };
}

function countMergeDiffLines(diff: RepoImportMergeDiff) {
  return {
    added: diff.lines.filter((line) => line.kind === 'added').length,
    removed: diff.lines.filter((line) => line.kind === 'removed').length,
  };
}

function formatDebugDetail(detail: unknown): string {
  if (detail == null) {
    return '';
  }
  if (typeof detail === 'string') {
    return detail;
  }

  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
}

function formatContradictionValue(value: unknown): string {
  if (value == null) {
    return 'Empty';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function contradictionKey(batchIndex: number, contradictionIndex: number) {
  return `${batchIndex}:${contradictionIndex}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizedText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    : '';
}

function objectText(value: unknown, key: string): string {
  return isRecord(value) && (typeof value[key] === 'string' || typeof value[key] === 'number')
    ? String(value[key])
    : '';
}

function incomingIndex(value: unknown, length: number): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (parsed >= 0 && parsed < length) {
      return parsed;
    }
  }

  return null;
}

function entryMatchScore(entry: RepoImportEntry, incomingValue: unknown, existingId?: string | null): number {
  let score = 0;
  if (existingId && entry.merge_target_id?.trim() === existingId) {
    score += 5;
  }

  const incomingTitle = normalizedText(objectText(incomingValue, 'title'));
  const incomingCompany = normalizedText(objectText(incomingValue, 'company'));
  const incomingPosition = normalizedText(objectText(incomingValue, 'position'));
  const incomingStart = normalizedText(objectText(incomingValue, 'start_date'));
  const incomingEnd = normalizedText(objectText(incomingValue, 'end_date'));
  const incomingType = normalizedText(objectText(incomingValue, 'type'));
  const incomingFreewrite = normalizedText(objectText(incomingValue, 'freewrite'));

  if (incomingTitle && normalizedText(entry.title) === incomingTitle) score += 3;
  if (incomingCompany && normalizedText(entry.company) === incomingCompany) score += 2;
  if (incomingPosition && normalizedText(entry.position) === incomingPosition) score += 1;
  if (incomingStart && normalizedText(entry.start_date) === incomingStart) score += 1;
  if (incomingEnd && normalizedText(entry.end_date) === incomingEnd) score += 1;
  if (incomingType && normalizedText(entry.type) === incomingType) score += 1;
  if (incomingFreewrite && normalizedText(entry.freewrite).includes(incomingFreewrite.slice(0, 80))) {
    score += 2;
  }

  return score;
}

function findRepositoryContradictionEntryIndex(
  payload: RepoImportPayload,
  contradiction: RepoImportContradiction,
): number | null {
  const directIndex = incomingIndex(contradiction.incoming_index, payload.entries.length);
  if (directIndex != null) {
    return directIndex;
  }

  let bestIndex: number | null = null;
  let bestScore = 0;
  payload.entries.forEach((entry, index) => {
    const score = entryMatchScore(
      entry,
      contradiction.incoming_value,
      contradiction.existing_id,
    );
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestScore > 0 ? bestIndex : null;
}

function educationMatchScore(education: RepoImportEducation, incomingValue: unknown): number {
  let score = 0;
  if (normalizedText(education.school) && normalizedText(education.school) === normalizedText(objectText(incomingValue, 'school'))) {
    score += 4;
  }
  if (normalizedText(education.degree) && normalizedText(education.degree) === normalizedText(objectText(incomingValue, 'degree'))) {
    score += 2;
  }
  if (normalizedText(education.major) && normalizedText(education.major) === normalizedText(objectText(incomingValue, 'major'))) {
    score += 2;
  }
  if (normalizedText(education.grad_date) && normalizedText(education.grad_date) === normalizedText(objectText(incomingValue, 'grad_date'))) {
    score += 1;
  }
  if (normalizedText(education.gpa) && normalizedText(education.gpa) === normalizedText(objectText(incomingValue, 'gpa'))) {
    score += 1;
  }
  if (normalizedText(education.location) && normalizedText(education.location) === normalizedText(objectText(incomingValue, 'location'))) {
    score += 1;
  }
  if (normalizedText(education.notes) && normalizedText(objectText(incomingValue, 'notes')).includes(normalizedText(education.notes).slice(0, 80))) {
    score += 1;
  }
  return score;
}

type EducationPatchKey = 'school' | 'degree' | 'major' | 'start_date' | 'grad_date' | 'gpa' | 'location' | 'coursework';

function educationPatchKeyForField(field: string | undefined): EducationPatchKey | null {
  const normalized = normalizedText(field);
  if (!normalized) return null;
  if (normalized.includes('school') || normalized.includes('institution')) return 'school';
  if (normalized.includes('degree')) return 'degree';
  if (normalized.includes('major')) return 'major';
  if (normalized.includes('gpa')) return 'gpa';
  if (normalized.includes('location')) return 'location';
  if (normalized.includes('coursework') || normalized.includes('honor') || normalized.includes('note')) {
    return 'coursework';
  }
  if (normalized.includes('start') || normalized.includes('enrol')) return 'start_date';
  if (normalized.includes('grad') || normalized.includes('date')) return 'grad_date';
  return null;
}

function educationValueForPatchKey(
  education: RepoImportEducation | EducationItem,
  key: EducationPatchKey,
): string {
  if (key === 'coursework') {
    return 'coursework' in education ? education.coursework ?? '' : education.notes ?? '';
  }
  return education[key] ?? '';
}

function contradictionValueForPatchKey(
  value: unknown,
  key: EducationPatchKey,
): string | undefined {
  if (isRecord(value)) {
    const direct = objectText(value, key);
    if (direct) return direct;
    if (key === 'coursework') {
      return objectText(value, 'notes') || objectText(value, 'honors') || undefined;
    }
    return undefined;
  }

  const scalar = normalizedText(value) ? String(value) : '';
  return scalar || undefined;
}

function buildEducationPatchBody(
  contradiction: RepoImportContradiction,
  incoming: RepoImportEducation,
): Record<EducationPatchKey, string | null> | null {
  const patchKey = educationPatchKeyForField(contradiction.field);
  if (patchKey) {
    const selectedValue =
      contradictionValueForPatchKey(contradiction.incoming_value, patchKey) ??
      educationValueForPatchKey(incoming, patchKey);

    return {
      [patchKey]: selectedValue.trim() || null,
    } as Record<EducationPatchKey, string | null>;
  }

  const body: Partial<Record<EducationPatchKey, string | null>> = {};
  if (incoming.school?.trim()) body.school = incoming.school.trim();
  if (incoming.degree !== undefined) body.degree = incoming.degree?.trim() || null;
  if (incoming.major !== undefined) body.major = incoming.major?.trim() || null;
  if (incoming.start_date !== undefined) body.start_date = incoming.start_date?.trim() || null;
  if (incoming.grad_date !== undefined) body.grad_date = incoming.grad_date?.trim() || null;
  if (incoming.gpa !== undefined) body.gpa = incoming.gpa?.trim() || null;
  if (incoming.location !== undefined) body.location = incoming.location?.trim() || null;
  if (incoming.notes !== undefined) body.coursework = incoming.notes?.trim() || '';

  return Object.keys(body).length > 0 ? body as Record<EducationPatchKey, string | null> : null;
}

function existingEducationScore(
  item: EducationItem,
  incoming: RepoImportEducation | null,
  contradiction: RepoImportContradiction,
): number {
  let score = 0;

  if (incoming) {
    if (normalizedText(item.school) && normalizedText(item.school) === normalizedText(incoming.school)) score += 4;
    if (normalizedText(item.degree) && normalizedText(item.degree) === normalizedText(incoming.degree)) score += 2;
    if (normalizedText(item.major) && normalizedText(item.major) === normalizedText(incoming.major)) score += 2;
    if (normalizedText(item.grad_date) && normalizedText(item.grad_date) === normalizedText(incoming.grad_date)) score += 1;
    if (normalizedText(item.gpa) && normalizedText(item.gpa) === normalizedText(incoming.gpa)) score += 1;
    if (normalizedText(item.location) && normalizedText(item.location) === normalizedText(incoming.location)) score += 1;
  }

  const patchKey = educationPatchKeyForField(contradiction.field);
  if (patchKey) {
    const existingValue = contradictionValueForPatchKey(contradiction.existing_value, patchKey);
    if (
      existingValue &&
      normalizedText(educationValueForPatchKey(item, patchKey)) === normalizedText(existingValue)
    ) {
      score += 4;
    }
  }

  if (isRecord(contradiction.existing_value)) {
    const fields: EducationPatchKey[] = ['school', 'degree', 'major', 'start_date', 'grad_date', 'gpa', 'location', 'coursework'];
    for (const field of fields) {
      const existingValue = contradictionValueForPatchKey(contradiction.existing_value, field);
      if (
        existingValue &&
        normalizedText(educationValueForPatchKey(item, field)) === normalizedText(existingValue)
      ) {
        score += field === 'school' ? 4 : 1;
      }
    }
  }

  return score;
}

function findExistingEducationForContradiction(
  existingItems: EducationItem[],
  incoming: RepoImportEducation | null,
  contradiction: RepoImportContradiction,
): EducationItem | null {
  const existingId = contradiction.existing_id?.trim();
  if (existingId) {
    const exact = existingItems.find((item) => item.id === existingId);
    if (exact) return exact;
  }

  let bestItem: EducationItem | null = null;
  let bestScore = 0;
  let tied = false;

  for (const item of existingItems) {
    const score = existingEducationScore(item, incoming, contradiction);
    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
      tied = false;
    } else if (score === bestScore && score > 0) {
      tied = true;
    }
  }

  return bestScore >= 4 && !tied ? bestItem : null;
}

function findEducationContradictionIndex(
  payload: RepoImportPayload,
  contradiction: RepoImportContradiction,
): number | null {
  const education = payload.profile?.education ?? [];
  const directIndex = incomingIndex(contradiction.incoming_index, education.length);
  if (directIndex != null) {
    return directIndex;
  }

  let bestIndex: number | null = null;
  let bestScore = 0;
  const patchKey = educationPatchKeyForField(contradiction.field);
  const incomingFieldValue = patchKey
    ? contradictionValueForPatchKey(contradiction.incoming_value, patchKey)
    : undefined;

  education.forEach((item, index) => {
    let score = educationMatchScore(item, contradiction.incoming_value);
    if (
      patchKey &&
      incomingFieldValue &&
      normalizedText(educationValueForPatchKey(item, patchKey)) === normalizedText(incomingFieldValue)
    ) {
      score += 3;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestScore > 0 ? bestIndex : null;
}

function clearIncomingEducationContradictionField(
  education: RepoImportEducation,
  contradiction: RepoImportContradiction,
): boolean {
  const patchKey = educationPatchKeyForField(contradiction.field);
  if (!patchKey) {
    return false;
  }

  if (patchKey === 'school' || patchKey === 'degree') {
    return false;
  }

  if (patchKey === 'coursework') {
    education.notes = undefined;
    return true;
  }

  education[patchKey] = undefined;
  return true;
}

function applyRepositoryResolutionOption(
  entry: RepoImportEntry,
  option: RepoImportResolutionEntry | undefined,
): boolean {
  if (!option) {
    return false;
  }

  let changed = false;
  if (option.type) {
    entry.type = option.type;
    changed = true;
  }
  if (option.title?.trim()) {
    entry.title = option.title.trim();
    changed = true;
  }
  if (option.company !== undefined) {
    entry.company = option.company?.trim() || null;
    changed = true;
  }
  if (option.position !== undefined) {
    entry.position = option.position?.trim() || null;
    changed = true;
  }
  if (option.start_date !== undefined) {
    entry.start_date = option.start_date?.trim() || null;
    changed = true;
  }
  if (option.end_date !== undefined) {
    entry.end_date = option.end_date?.trim() || null;
    changed = true;
  }
  if (option.freewrite?.trim()) {
    entry.freewrite = option.freewrite.trim();
    changed = true;
  }

  return changed;
}

function profileArrayWithoutValue(values: string[] | undefined, incoming: unknown): string[] {
  const incomingText = normalizedText(incoming);
  if (!incomingText) {
    return values ?? [];
  }
  return (values ?? []).filter((value) => normalizedText(value) !== incomingText);
}

function removeIncomingProfileContradiction(
  payload: RepoImportPayload,
  contradiction: RepoImportContradiction,
) {
  if (!payload.profile) {
    return;
  }

  const field = normalizedText(contradiction.field);
  if (field.includes('skill')) {
    payload.profile.skills_note = '';
    return;
  }

  if (field.includes('other') || field.includes('fixed') || field.includes('fact')) {
    if (Array.isArray(contradiction.incoming_value)) {
      const incomingValues = new Set(contradiction.incoming_value.map(normalizedText));
      payload.profile.other_fixed_facts = (payload.profile.other_fixed_facts ?? []).filter(
        (value) => !incomingValues.has(normalizedText(value)),
      );
      return;
    }

    payload.profile.other_fixed_facts = profileArrayWithoutValue(
      payload.profile.other_fixed_facts,
      contradiction.incoming_value,
    );
  }
}

function RepoImportMergeDiffView({ diffs }: { diffs: RepoImportMergeDiff[] }) {
  if (diffs.length === 0) {
    return null;
  }

  const totalAdded = diffs.reduce(
    (sum, diff) => sum + countMergeDiffLines(diff).added,
    0,
  );
  const totalRemoved = diffs.reduce(
    (sum, diff) => sum + countMergeDiffLines(diff).removed,
    0,
  );

  return (
    <div className="repo-import-diff">
      <div className="repo-import-diff-summary">
        <span className="resume-diff-stat resume-diff-stat--mod">
          {diffs.length} merged
        </span>
        <span className="resume-diff-stat resume-diff-stat--add">
          +{totalAdded} lines
        </span>
        <span className="resume-diff-stat resume-diff-stat--remove">
          -{totalRemoved} lines
        </span>
      </div>

      <div className="repo-import-diff-list">
        {diffs.map((diff) => {
          const counts = countMergeDiffLines(diff);
          return (
            <article key={`${diff.id}-${diff.sourceLabel}`} className="repo-import-diff-card">
              <header className="repo-import-diff-card-header">
                <span className="resume-diff-badge resume-diff-badge--modified">
                  Merged
                </span>
                <span className="resume-diff-location">{diff.title}</span>
                {diff.company ? (
                  <span className="resume-diff-label">{diff.company}</span>
                ) : null}
                <span className="repo-import-diff-count">
                  +{counts.added} / -{counts.removed}
                </span>
              </header>

              <pre className="repo-import-diff-lines">
                {diff.lines.map((line, index) => (
                  <span
                    key={`${index}-${line.kind}-${line.text}`}
                    className={`repo-import-diff-line repo-import-diff-line--${line.kind}`}
                  >
                    <span className="repo-import-diff-prefix">
                      {line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '}
                    </span>
                    <span>{line.text || ' '}</span>
                  </span>
                ))}
              </pre>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ContradictionReview({
  items,
  choices,
  onChoice,
  onApply,
  onCancel,
  working,
}: {
  items: PendingContradiction[];
  choices: Record<string, ContradictionChoice>;
  onChoice: (key: string, choice: ContradictionChoice) => void;
  onApply: () => void;
  onCancel: () => void;
  working: boolean;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="repo-import-conflicts">
      <header>
        <h3>Resolve contradictions before merging</h3>
        <p>
          These facts cannot both be treated as true. Additive facts like extra skills
          still merge normally.
        </p>
      </header>
      <div className="repo-import-conflict-table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Field</th>
              <th scope="col">Existing</th>
              <th scope="col">Incoming</th>
              <th scope="col">Use</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ key, sourceLabel, contradiction }) => (
              <tr key={key}>
                <td>
                  <strong>{sourceLabel}</strong>
                  <span>{contradiction.reason}</span>
                </td>
                <td>{contradiction.field ?? contradiction.category}</td>
                <td>
                  <pre>{formatContradictionValue(contradiction.existing_value)}</pre>
                </td>
                <td>
                  <pre>{formatContradictionValue(contradiction.incoming_value)}</pre>
                </td>
                <td>
                  <label>
                    <input
                      type="radio"
                      checked={(choices[key] ?? 'existing') === 'existing'}
                      onChange={() => onChoice(key, 'existing')}
                      disabled={working}
                    />
                    Existing
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={choices[key] === 'incoming'}
                      onChange={() => onChoice(key, 'incoming')}
                      disabled={working}
                    />
                    Incoming
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="repo-import-conflict-actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel} disabled={working}>
          Cancel import
        </button>
        <button type="button" className="btn btn--primary btn--sm" onClick={onApply} disabled={working}>
          {working ? <Loader2 size={14} className="spin" /> : null}
          Apply choices & merge
        </button>
      </div>
    </section>
  );
}

function ImportSummaryTable({ summary }: { summary: ImportSummary }) {
  const rows = [
    {
      area: 'Repository entries',
      firstLabel: 'New',
      firstValue: summary.repository.created,
      secondLabel: 'Merged',
      secondValue: summary.repository.merged,
      skipped: summary.repository.skipped,
      note: 'Saved as freewrite',
    },
    {
      area: 'Education records',
      firstLabel: 'New',
      firstValue: summary.education.created,
      secondLabel: 'Merged',
      secondValue: summary.education.merged,
      skipped: summary.education.skipped,
      note: 'Education Info tab',
    },
  ];

  return (
    <div className="repo-import-summary">
      <h3>Import results</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">Area</th>
            <th scope="col">Action 1</th>
            <th scope="col">Action 2</th>
            <th scope="col">Skipped</th>
            <th scope="col">Where it went</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.area}>
              <th scope="row">{row.area}</th>
              <td>
                <strong>{row.firstValue}</strong> {row.firstLabel}
              </td>
              <td>
                <strong>{row.secondValue}</strong> {row.secondLabel}
              </td>
              <td>
                <strong>{row.skipped}</strong> Skipped
              </td>
              <td>{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
  const [mergeDiffs, setMergeDiffs] = useState<RepoImportMergeDiff[]>([]);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false);
  const [pendingBatches, setPendingBatches] = useState<PendingImportBatch[]>([]);
  const [pendingContradictions, setPendingContradictions] = useState<PendingContradiction[]>([]);
  const [contradictionChoices, setContradictionChoices] = useState<Record<string, ContradictionChoice>>({});

  const {
    bridgeReady,
    sendPdfAndWait,
    sendPromptAndWait,
    scrapeUrlAndWait,
    pipelineEvents,
    pipelineVariant,
    debugEvents,
    startPipeline,
    pushPipeline,
  } = useAiBridge();

  const handlePdfChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter(
      (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'),
    );
    setPdfFiles(files);
    setError(null);
  };

  const copyDiagnostics = useCallback(async () => {
    const payload = {
      copied_at: new Date().toISOString(),
      provider,
      tab,
      error,
      status,
      importSummary,
      events: debugEvents,
    };
    const text = JSON.stringify(payload, null, 2);

    const fallbackCopy = () => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    };

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        fallbackCopy();
      }
    } else {
      fallbackCopy();
    }
    setDiagnosticsCopied(true);
    window.setTimeout(() => setDiagnosticsCopied(false), 1600);
  }, [debugEvents, error, importSummary, provider, status, tab]);

  const reloadExisting = useCallback(async (): Promise<RepoItem[]> => {
    const res = await fetch('/api/repo');
    if (!res.ok) throw new Error('Failed to load repository entries.');
    return res.json();
  }, []);

  const reloadExistingEducation = useCallback(async (): Promise<EducationData> => {
    const res = await fetch('/api/education');
    if (!res.ok) throw new Error('Failed to load education records.');
    return res.json();
  }, []);

  const collectContradictions = useCallback((batches: PendingImportBatch[]) => {
    const items: PendingContradiction[] = [];
    batches.forEach((batch, batchIndex) => {
      (batch.payload.contradictions ?? []).forEach((contradiction, contradictionIndex) => {
        items.push({
          key: contradictionKey(batchIndex, contradictionIndex),
          batchIndex,
          contradictionIndex,
          sourceLabel: batch.sourceLabel,
          contradiction,
        });
      });
    });
    return items;
  }, []);

  const applyEducationResolution = useCallback(
    async (contradiction: RepoImportContradiction, payload: RepoImportPayload, choice: ContradictionChoice) => {
      if (contradiction.category !== 'education') {
        return { merged: 0, skipped: 0, applied: false };
      }

      const index = findEducationContradictionIndex(payload, contradiction);
      const incoming = index == null ? null : payload.profile?.education?.[index];

      if (!incoming) {
        return { merged: 0, skipped: 1, applied: false };
      }

      if (choice === 'incoming') {
        const existingEducation = await reloadExistingEducation();
        const match = findExistingEducationForContradiction(
          existingEducation.items,
          incoming,
          contradiction,
        );
        const body = buildEducationPatchBody(contradiction, incoming);

        if (!match || !body) {
          return { merged: 0, skipped: 1, applied: false };
        }

        const res = await fetch(`/api/education/${match.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error('Failed to apply education contradiction choice.');
        }
        return { merged: 1, skipped: 0, applied: true };
      }

      return { merged: 0, skipped: 1, applied: false };
    },
    [reloadExistingEducation],
  );

  const applyRepositoryResolution = useCallback(
    async (contradiction: RepoImportContradiction, payload: RepoImportPayload, choice: ContradictionChoice) => {
      if (contradiction.category !== 'repository') {
        return { removeEntryIndex: null as number | null, skipped: 0 };
      }

      const entryIndex = findRepositoryContradictionEntryIndex(payload, contradiction);
      const entry = entryIndex == null ? null : payload.entries[entryIndex];
      if (!entry) {
        return { removeEntryIndex: null as number | null, skipped: 1 };
      }

      const existingId = contradiction.existing_id?.trim();
      if (existingId) {
        entry.merge_target_id = existingId;
      }

      if (choice === 'existing') {
        const applied = applyRepositoryResolutionOption(
          entry,
          contradiction.resolution_options?.existing,
        );
        return applied
          ? { removeEntryIndex: null as number | null, skipped: 0 }
          : { removeEntryIndex: entryIndex, skipped: 1 };
      }

      applyRepositoryResolutionOption(
        entry,
        contradiction.resolution_options?.incoming,
      );

      if (existingId) {
        entry.merge_target_id = existingId;
      }

      return { removeEntryIndex: null as number | null, skipped: 0 };
    },
    [],
  );

  const resolvePayloadForChoices = useCallback(
    async (
      batch: PendingImportBatch,
      batchIndex: number,
      choices: Record<string, ContradictionChoice>,
    ) => {
      const payload: RepoImportPayload = {
        ...batch.payload,
        profile: batch.payload.profile
          ? {
              ...batch.payload.profile,
              education: [...(batch.payload.profile.education ?? [])],
              other_fixed_facts: [...(batch.payload.profile.other_fixed_facts ?? [])],
            }
          : undefined,
        entries: [...batch.payload.entries],
        contradictions: [],
      };
      const removeEducationIndexes = new Set<number>();
      const removeEntryIndexes = new Set<number>();
      let educationMerged = 0;
      let educationSkipped = 0;
      let repositorySkipped = 0;

      for (const [contradictionIndex, contradiction] of (batch.payload.contradictions ?? []).entries()) {
        const key = contradictionKey(batchIndex, contradictionIndex);
        const choice = choices[key] ?? 'existing';

        if (contradiction.category === 'education') {
          const result = await applyEducationResolution(contradiction, payload, choice);
          educationMerged += result.merged;
          educationSkipped += result.skipped;
          const educationIndex = findEducationContradictionIndex(payload, contradiction);

          if (
            educationIndex != null &&
            (choice === 'existing' || result.applied)
          ) {
            const education = payload.profile?.education?.[educationIndex];
            const keepEducationForAdditiveMerge = education
              ? clearIncomingEducationContradictionField(education, contradiction)
              : false;
            if (!keepEducationForAdditiveMerge) {
              removeEducationIndexes.add(educationIndex);
            }
          }
          continue;
        }

        if (contradiction.category === 'repository') {
          const result = await applyRepositoryResolution(contradiction, payload, choice);
          if (result.removeEntryIndex != null) {
            removeEntryIndexes.add(result.removeEntryIndex);
          }
          repositorySkipped += result.skipped;
          continue;
        }

        if ((contradiction.category === 'profile' || contradiction.category === 'other') && choice === 'existing') {
          removeIncomingProfileContradiction(payload, contradiction);
        }
      }

      if (payload.profile?.education) {
        payload.profile.education = payload.profile.education.filter(
          (_item, index) => !removeEducationIndexes.has(index),
        );
      }
      if (removeEntryIndexes.size > 0) {
        payload.entries = payload.entries.filter(
          (_item, index) => !removeEntryIndexes.has(index),
        );
      }

      return { payload, educationMerged, educationSkipped, repositorySkipped };
    },
    [applyEducationResolution, applyRepositoryResolution],
  );

  const applyBatches = useCallback(
    async (
      batches: PendingImportBatch[],
      choices: Record<string, ContradictionChoice> = {},
    ) => {
      let totalCreated = 0;
      let totalMerged = 0;
      let totalSkipped = 0;
      let totalEducationCreated = 0;
      let totalEducationMerged = 0;
      let totalEducationSkipped = 0;
      const collectedMergeDiffs: RepoImportMergeDiff[] = [];
      let workingItems = await reloadExisting();

      for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        const resolved = await resolvePayloadForChoices(batch, index, choices);
        const entries = flattenImportPayload(resolved.payload);
        const result = await applyRepoImportMerge(
          workingItems,
          entries,
          batch.sourceLabel,
          resolved.payload.profile,
        );

        totalCreated += result.created;
        totalMerged += result.merged;
        totalSkipped += result.skipped + resolved.repositorySkipped;
        totalEducationCreated += result.educationCreated;
        totalEducationMerged += result.educationMerged + resolved.educationMerged;
        totalEducationSkipped += result.educationSkipped + resolved.educationSkipped;
        collectedMergeDiffs.push(...result.mergeDiffs);

        workingItems = await reloadExisting();
      }

      pushPipeline('preview_ready', 'Import complete');
      setStatus('Import complete.');
      setImportSummary({
        repository: {
          created: totalCreated,
          merged: totalMerged,
          skipped: totalSkipped,
        },
        education: {
          created: totalEducationCreated,
          merged: totalEducationMerged,
          skipped: totalEducationSkipped,
        },
      });
      setMergeDiffs(collectedMergeDiffs);
      setPendingBatches([]);
      setPendingContradictions([]);
      setContradictionChoices({});
      setPdfFiles([]);
      setLinkedInUrl('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onComplete?.();
    },
    [onComplete, pushPipeline, reloadExisting, resolvePayloadForChoices],
  );

  const runImport = useCallback(async () => {
    if (!bridgeReady) {
      setError('Extension required. Reload extension, then refresh this page (Cmd+R).');
      return;
    }

    setWorking(true);
    setError(null);
    setStatus(null);
    setMergeDiffs([]);
    setImportSummary(null);
    setPendingBatches([]);
    setPendingContradictions([]);
    setContradictionChoices({});
    startPipeline('import');

    try {
      const workingItems = await reloadExisting();
      const workingEducation = await reloadExistingEducation();
      const batches: PendingImportBatch[] = [];

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
            prompt: buildRepoImportFromPdfPrompt(filename, workingItems, workingEducation),
            pdfBase64: base64,
            filename,
            forceNewChat: true,
          });

          const payload = parseRepoImportResponse(response.rawResponse!);
          batches.push({
            sourceLabel: payload.source_label ?? filename,
            payload,
          });
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
            workingItems,
            workingEducation,
          ),
        });

        const payload = parseRepoImportResponse(response.rawResponse!);
        batches.push({
          sourceLabel: payload.source_label ?? 'LinkedIn',
          payload: {
            ...payload,
            source_label: payload.source_label ?? 'LinkedIn',
          },
        });
      }

      const contradictions = collectContradictions(batches);
      if (contradictions.length > 0) {
        const defaultChoices = Object.fromEntries(
          contradictions.map((item) => [item.key, 'existing' as ContradictionChoice]),
        );
        setPendingBatches(batches);
        setPendingContradictions(contradictions);
        setContradictionChoices(defaultChoices);
        setStatus('Resolve contradictions before merging.');
        pushPipeline('waiting', `${contradictions.length} contradiction${contradictions.length === 1 ? '' : 's'} need review`);
        return;
      }

      await applyBatches(batches);
    } catch (err) {
      pushPipeline('error', err instanceof Error ? err.message : 'Import failed.');
      setError(err instanceof Error ? err.message : 'Import failed.');
      setStatus(null);
      setMergeDiffs([]);
      setImportSummary(null);
    } finally {
      setWorking(false);
    }
  }, [
    bridgeReady,
    applyBatches,
    collectContradictions,
    linkedInUrl,
    pdfFiles,
    provider,
    pushPipeline,
    reloadExisting,
    reloadExistingEducation,
    scrapeUrlAndWait,
    sendPromptAndWait,
    sendPdfAndWait,
    startPipeline,
    tab,
  ]);

  const handleContradictionChoice = useCallback((key: string, choice: ContradictionChoice) => {
    setContradictionChoices((current) => ({ ...current, [key]: choice }));
  }, []);

  const applyPendingImport = useCallback(async () => {
    if (pendingBatches.length === 0) {
      return;
    }

    setWorking(true);
    setError(null);
    try {
      await applyBatches(pendingBatches, contradictionChoices);
    } catch (err) {
      pushPipeline('error', err instanceof Error ? err.message : 'Import failed.');
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setWorking(false);
    }
  }, [applyBatches, contradictionChoices, pendingBatches, pushPipeline]);

  const cancelPendingImport = useCallback(() => {
    setPendingBatches([]);
    setPendingContradictions([]);
    setContradictionChoices({});
    setStatus(null);
  }, []);

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn--ghost repo-import-toggle"
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
            <strong>Education Info</strong> tab. Explicit AI matches replace saved
            freewrite with a coherent merged version; fuzzy local matches append.
            Ongoing roles/projects are saved with no end date (shown as “present”).
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

      <PipelineStatus events={pipelineEvents} variant={pipelineVariant} />

      {status ? <p className="repo-import-status">{status}</p> : null}
      <ContradictionReview
        items={pendingContradictions}
        choices={contradictionChoices}
        onChoice={handleContradictionChoice}
        onApply={applyPendingImport}
        onCancel={cancelPendingImport}
        working={working}
      />
      {importSummary ? <ImportSummaryTable summary={importSummary} /> : null}
      {error ? <p className="repo-import-error">{error}</p> : null}
      {debugEvents.length > 0 ? (
        <details className="repo-import-debug" open={Boolean(error)}>
          <summary>
            <span>Diagnostics ({debugEvents.length})</span>
            <button
              type="button"
              className="repo-import-debug-copy"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void copyDiagnostics();
              }}
            >
              {diagnosticsCopied ? <Check size={13} /> : <Clipboard size={13} />}
              {diagnosticsCopied ? 'Copied' : 'Copy all'}
            </button>
          </summary>
          <div className="repo-import-debug-list">
            {debugEvents.slice(-30).map((entry, index) => (
              <article key={`${entry.at}-${entry.event}-${index}`} className="repo-import-debug-entry">
                <div className="repo-import-debug-meta">
                  <span>{new Date(entry.at).toLocaleTimeString()}</span>
                  <strong>{entry.event}</strong>
                </div>
                {entry.detail != null ? (
                  <pre>{formatDebugDetail(entry.detail)}</pre>
                ) : null}
              </article>
            ))}
          </div>
        </details>
      ) : null}
      <RepoImportMergeDiffView diffs={mergeDiffs} />

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
