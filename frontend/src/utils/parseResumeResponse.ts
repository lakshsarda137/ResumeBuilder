import type {
  ResumeData,
  ResumeBullet,
  ResumeEntry,
  ResumeSection,
  SkillCategory,
} from '../types/resume';
import { makeBullet } from '../types/resume';
import { migrateResumeData } from './migrateResume';
import { sanitizeEmDashes } from './emDash';
import { ensureContactProfile } from './contactProfile';

export function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function repairJson(json: string): string {
  return json
    .replace(/^\uFEFF/, '')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

export function extractJsonCandidate(text: string): string {
  const delimitedBlocks = [
    ...text.matchAll(/---JSON-START---\s*([\s\S]*?)\s*---JSON-END---/g),
  ];
  if (delimitedBlocks.length > 0) {
    return delimitedBlocks[delimitedBlocks.length - 1][1].trim();
  }

  const fencedBlocks = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)];
  if (fencedBlocks.length > 0) {
    return fencedBlocks[fencedBlocks.length - 1][1].trim();
  }

  const fenced = text.match(/```\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    return objectMatch[0].trim();
  }

  throw new Error(
    'LLM response did not include a JSON code block. Ask it to return ```json with the full resume.',
  );
}

export function parseJsonCandidate(candidate: string): unknown {
  try {
    return JSON.parse(repairJson(candidate));
  } catch {
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
}

function expandToJsonObject(text: string, anchorPos: number): string {
  let depth = 0;
  let start = -1;

  for (let index = anchorPos; index >= 0; index -= 1) {
    if (text[index] === '}') {
      depth += 1;
    } else if (text[index] === '{') {
      if (depth === 0) {
        start = index;
        break;
      }
      depth -= 1;
    }
  }

  if (start === -1) {
    return '';
  }

  depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1).trim();
      }
    }
  }

  return '';
}

export function collectJsonCandidates(text: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (candidate: string | undefined) => {
    const trimmed = candidate?.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      candidates.push(trimmed);
    }
  };

  for (const match of text.matchAll(/---JSON-START---\s*([\s\S]*?)\s*---JSON-END---/g)) {
    push(match[1]);
  }

  for (const match of text.matchAll(/```json\s*([\s\S]*?)```/gi)) {
    push(match[1]);
  }

  for (const match of text.matchAll(/```\s*([\s\S]*?)```/g)) {
    push(match[1]);
  }

  for (const anchor of [
    '"baseline"',
    '"optimized"',
    '"contact"',
    '"sections"',
    '"entries"',
    '"skills"',
    '"bullets"',
  ]) {
    let position = text.lastIndexOf(anchor);
    while (position !== -1) {
      push(expandToJsonObject(text, position));
      position = text.lastIndexOf(anchor, position - 1);
    }
  }

  const objectMatch = text.match(/\{[\s\S]*\}/);
  push(objectMatch?.[0]);

  return candidates;
}

function normalizeComparableText(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/\s+/g, ' ')
    : '';
}

function isPlaceholderText(value: unknown): boolean {
  const text = normalizeComparableText(value);
  if (!text) {
    return true;
  }

  return (
    text === 'string' ||
    text === 'title' ||
    text === 'category' ||
    text === 'section' ||
    text === 'bullet' ||
    text === 'bullet text' ||
    text === 'optional string' ||
    text.startsWith('optional ') ||
    /^bullet \d+$/.test(text)
  );
}

export function hasRealText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 1 && !isPlaceholderText(value);
}

export function cleanGeneratedText(value: string): string {
  return sanitizeInlineFormatting(value)
    .replace(/\s*\((?:please\s+)?edit(?:\s+[^)]*)?\)/gi, '')
    .replace(/\s*\[(?:please\s+)?edit(?:\s+[^\]]*)?\]/gi, '')
    .replace(/\s*\(add your [^)]+\)/gi, '')
    .replace(/\s*\[add your [^\]]+\]/gi, '')
    .replace(/\bGPA:\s*X\.XX\s*\/\s*4\.00\b/gi, '')
    .replace(/\bExpected May 20XX\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Same as `cleanGeneratedText`, plus the em-dash content rule. Never use on date fields. */
export function cleanGeneratedProseText(value: string): string {
  return sanitizeEmDashes(cleanGeneratedText(value));
}

export function sanitizeInlineFormatting(value: string): string {
  return value
    .replace(/<\s*mark(?:\s+[^>]*)?>/gi, '<strong>')
    .replace(/<\s*\/\s*mark\s*>/gi, '</strong>')
    .replace(/\sstyle=(["'])(.*?)\1/gi, (_match, quote: string, style: string) => {
      const allowed = style
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .filter((part) => /^(font-weight|font-style)\s*:/i.test(part));

      return allowed.length > 0 ? ` style=${quote}${allowed.join('; ')}${quote}` : '';
    });
}

function normalizeEducationSubtitle(value: string): string {
  return value.replace(/\s+\|\s+/g, '; ').replace(/;\s*;/g, ';').trim();
}

function standaloneGpaText(value: string): string | null {
  const match = value
    .trim()
    .match(/^(?:GPA|Grade Point Average)\s*:?\s*([0-9](?:\.\d{1,3})?)\s*\/\s*([0-9]{1,2}(?:\.\d{1,2})?)\.?$/i);

  if (!match) {
    return null;
  }

  return `GPA: ${match[1]}/${match[2]}`;
}

function splitEducationSubtitleDetails(value: string): {
  subtitle: string;
  detailBullet: string | null;
} {
  const parts = normalizeEducationSubtitle(value)
    .split(/\s*;\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  const subtitleParts: string[] = [];
  const detailParts: string[] = [];

  for (const part of parts) {
    if (/^(?:GPA|Grade Point Average)\s*:?/i.test(part)) {
      const normalized = standaloneGpaText(part) ?? part;
      detailParts.push(normalized);
      continue;
    }

    if (/\b(honor|honour|award|dean'?s list|president'?s|valedictorian|summa|magna|cum laude)\b/i.test(part)) {
      detailParts.push(part);
      continue;
    }

    subtitleParts.push(part);
  }

  return {
    subtitle: subtitleParts.join('; '),
    detailBullet: detailParts.length > 0 ? detailParts.join('; ') : null,
  };
}

function normalizeEducationEntry(entry: ResumeEntry): ResumeEntry {
  const splitSubtitle = splitEducationSubtitleDetails(entry.subtitle);
  const detailParts = splitSubtitle.detailBullet ? [splitSubtitle.detailBullet] : [];
  const bullets = entry.bullets.filter((bullet) => {
    const gpa = standaloneGpaText(bullet.text);
    if (!gpa) {
      return true;
    }
    detailParts.push(gpa);
    return false;
  });

  const uniqueDetailParts = Array.from(
    new Map(detailParts.map((part) => [part.toLowerCase(), part])).values(),
  );
  const detailBullet =
    uniqueDetailParts.length > 0 ? makeBullet(uniqueDetailParts.join('; ')) : null;

  return {
    ...entry,
    subtitle: splitSubtitle.subtitle,
    bullets: detailBullet ? [detailBullet, ...bullets] : bullets,
  };
}

export function resumeHasSubstantiveContent(resume: ResumeData): boolean {
  if (!Array.isArray(resume.sections) || resume.sections.length === 0) {
    return false;
  }

  return resume.sections.some((section) => {
    const hasRealEntry = section.entries.some((entry) => {
      const hasEntryIdentity =
        hasRealText(entry.title) ||
        hasRealText(entry.subtitle) ||
        hasRealText(entry.location) ||
        hasRealText(entry.date);
      const hasRealBullet = entry.bullets.some((bullet) => hasRealText(bullet.text));
      return (
        hasEntryIdentity &&
        (hasRealBullet ||
          hasRealText(entry.subtitle) ||
          hasRealText(entry.location) ||
          hasRealText(entry.date))
      );
    });

    const hasRealSkill = (section.skills ?? []).some(
      (skill) => hasRealText(skill.label) || hasRealText(skill.items),
    );

    return hasRealEntry || hasRealSkill;
  });
}

function looksLikeResumePayload(parsed: unknown): boolean {
  if (!isRecord(parsed)) {
    return false;
  }

  return isRecord(parsed.contact) && Array.isArray(parsed.sections);
}

function normalizeBullet(raw: unknown, index: number): ResumeBullet {
  if (typeof raw === 'string') {
    return makeBullet(cleanGeneratedProseText(raw));
  }

  if (raw && typeof raw === 'object') {
    const bullet = raw as { text?: unknown; jdComment?: unknown };
    const text =
      typeof bullet.text === 'string'
        ? cleanGeneratedProseText(bullet.text)
        : typeof (raw as { value?: unknown }).value === 'string'
          ? cleanGeneratedProseText((raw as { value: string }).value)
          : `Bullet ${index + 1}`;
    const jdComment =
      typeof bullet.jdComment === 'string' && bullet.jdComment.trim()
        ? bullet.jdComment.trim()
        : undefined;
    return makeBullet(text, jdComment);
  }

  return makeBullet(`Bullet ${index + 1}`);
}

function normalizeEntry(raw: Partial<ResumeEntry>, index: number): ResumeEntry {
  const bullets = Array.isArray(raw.bullets)
    ? raw.bullets.map((bullet, bulletIndex) =>
        normalizeBullet(bullet, bulletIndex),
      )
    : [];

  const jdComment =
    typeof raw.jdComment === 'string' && raw.jdComment.trim()
      ? raw.jdComment.trim()
      : undefined;

  return {
    id: typeof raw.id === 'string' ? raw.id : generateId(`entry-${index}`),
    title: typeof raw.title === 'string' ? cleanGeneratedProseText(raw.title) : 'Title',
    location: typeof raw.location === 'string' ? cleanGeneratedProseText(raw.location) : '',
    // Em dashes are allowed in dates (e.g. "Jan 2023 — Mar 2024") — do not sanitize.
    date: typeof raw.date === 'string' ? cleanGeneratedText(raw.date) : '',
    subtitle: typeof raw.subtitle === 'string' ? cleanGeneratedProseText(raw.subtitle) : '',
    bullets,
    jdComment,
  };
}

function normalizeSkill(raw: Partial<SkillCategory>, index: number): SkillCategory {
  const jdComment =
    typeof raw.jdComment === 'string' && raw.jdComment.trim()
      ? raw.jdComment.trim()
      : undefined;

  return {
    id: typeof raw.id === 'string' ? raw.id : generateId(`skill-${index}`),
    label: typeof raw.label === 'string' ? cleanGeneratedProseText(raw.label) : 'Category',
    items: typeof raw.items === 'string' ? cleanGeneratedProseText(raw.items) : '',
    jdComment,
  };
}

function normalizeSection(
  raw: Partial<ResumeSection>,
  index: number,
  fallback?: ResumeSection,
): ResumeSection {
  const type =
    raw.type === 'education' ||
    raw.type === 'experience' ||
    raw.type === 'projects' ||
    raw.type === 'skills' ||
    raw.type === 'custom'
      ? raw.type
      : fallback?.type ?? 'custom';

  const entries = Array.isArray(raw.entries)
    ? raw.entries.map((entry, entryIndex) =>
        normalizeEntry(entry as Partial<ResumeEntry>, entryIndex),
      )
    : fallback?.entries ?? [];

  const normalizedEntries =
    type === 'education' ? entries.map(normalizeEducationEntry) : entries;

  const skills = Array.isArray(raw.skills)
    ? raw.skills.map((skill, skillIndex) =>
        normalizeSkill(skill as Partial<SkillCategory>, skillIndex),
      )
    : fallback?.skills;

  const jdComment =
    typeof raw.jdComment === 'string' && raw.jdComment.trim()
      ? raw.jdComment.trim()
      : undefined;

  return {
    id: typeof raw.id === 'string' ? raw.id : fallback?.id ?? generateId(`section-${index}`),
    type,
    title:
      typeof raw.title === 'string'
        ? cleanGeneratedProseText(raw.title)
        : fallback?.title ?? 'Section',
    entries: type === 'skills' ? [] : normalizedEntries,
    skills: type === 'skills' ? skills ?? fallback?.skills ?? [] : skills,
    jdComment,
  };
}

export function normalizeAiResume(
  raw: unknown,
  fallback: ResumeData,
  options: {
    /**
     * Guarantee the header carries every canonical contact fact. Set for
     * resumes the app GENERATES; never set for a faithful transcription (a PDF
     * import, or the optimize path's "baseline"), where adding a link the
     * source document did not have would corrupt the before/after diff and
     * misrepresent what was uploaded.
     */
    enforceContactProfile?: boolean;
  } = {},
): ResumeData {
  const migrated = migrateResumeData(raw);
  const source = migrated.contact && migrated.sections ? migrated : fallback;

  const contact = {
    name:
      typeof source.contact?.name === 'string' && source.contact.name.trim()
        ? cleanGeneratedProseText(source.contact.name)
        : fallback.contact.name,
    links:
      Array.isArray(source.contact?.links) && source.contact.links.length > 0
        ? source.contact.links.map((link, index) => ({
            id:
              typeof link.id === 'string'
                ? link.id
                : fallback.contact.links[index]?.id ?? generateId(`link-${index}`),
            value: typeof link.value === 'string' ? cleanGeneratedProseText(link.value) : '',
          }))
        : fallback.contact.links,
  };

  const sections =
    Array.isArray(source.sections) && source.sections.length > 0
      ? source.sections.map((section, index) =>
          normalizeSection(
            section as Partial<ResumeSection>,
            index,
            fallback.sections[index],
          ),
        )
      : fallback.sections;

  return {
    contact: options.enforceContactProfile ? ensureContactProfile(contact) : contact,
    sections,
  };
}

const IMPORT_BASELINE: ResumeData = {
  contact: { name: '', links: [] },
  sections: [],
};

export function parseImportedResume(rawResponse: string): ResumeData {
  return parseResumeFromLlmResponse(rawResponse, IMPORT_BASELINE);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function parseOptimizedPdfResponse(rawResponse: string): {
  baseline: ResumeData;
  optimized: ResumeData;
} {
  const candidates = collectJsonCandidates(rawResponse);
  let sawInvalidJson = false;
  let sawOptimizedOnly = false;
  let sawPlainResume = false;
  let firstParseableKeys: string[] = [];

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const parsed = parseJsonCandidate(candidates[index]);
    if (!parsed) {
      sawInvalidJson = true;
      continue;
    }

    if (firstParseableKeys.length === 0 && isRecord(parsed)) {
      firstParseableKeys = Object.keys(parsed).slice(0, 8);
    }

    if (isRecord(parsed) && isRecord(parsed.optimized) && !isRecord(parsed.baseline)) {
      sawOptimizedOnly = true;
      continue;
    }

    if (looksLikeResumePayload(parsed)) {
      sawPlainResume = true;
      continue;
    }

    if (!isRecord(parsed) || !isRecord(parsed.baseline) || !isRecord(parsed.optimized)) {
      continue;
    }

    const baseline = normalizeAiResume(parsed.baseline, IMPORT_BASELINE);
    const optimized = normalizeAiResume(parsed.optimized, baseline, {
      enforceContactProfile: true,
    });
    if (!resumeHasSubstantiveContent(baseline) && resumeHasSubstantiveContent(optimized)) {
      throw new Error(
        'The LLM returned an optimized resume but did not include a faithful baseline extraction, so the app cannot show removals. Ask it to return both "baseline" and "optimized" objects.',
      );
    }
    return { baseline, optimized };
  }

  if (sawOptimizedOnly) {
    throw new Error(
      'The LLM returned only an optimized resume. Re-run and ask it to include both "baseline" and "optimized" so removals can be shown.',
    );
  }

  if (sawPlainResume) {
    throw new Error(
      'Captured a single resume JSON object instead of the required "baseline" and "optimized" wrapper. The provider response is correct only if the captured raw response starts with both wrapper keys.',
    );
  }

  if (sawInvalidJson) {
    throw new Error(
      'LLM returned invalid JSON. Open the linked chat, confirm the full JSON response finished, then try again.',
    );
  }

  throw new Error(
    firstParseableKeys.length > 0
      ? `The LLM response did not include the required "baseline" and "optimized" wrapper. Captured top-level keys: ${firstParseableKeys.join(', ')}.`
      : 'The LLM response did not include the required "baseline" and "optimized" wrapper, so the app cannot show an accurate before/after diff.',
  );
}

/**
 * Read one candidate's ATS verdict. Tolerant about shape because providers
 * vary: the score may arrive as a number or a numeric string, and the
 * justification under any of a few plausible key names.
 */
function readAtsScore(raw: unknown): { atsScore: number | null; justification: string } {
  if (!isRecord(raw)) {
    return { atsScore: null, justification: '' };
  }

  const rawScore = raw.atsScore ?? raw.ats_score ?? raw.score;
  const numeric =
    typeof rawScore === 'number'
      ? rawScore
      : typeof rawScore === 'string'
        ? Number(rawScore.replace(/[^0-9.]/g, ''))
        : NaN;

  const rawJustification =
    raw.justification ?? raw.rationale ?? raw.reasoning ?? raw.notes;

  return {
    atsScore: Number.isFinite(numeric)
      ? Math.min(100, Math.max(0, Math.round(numeric)))
      : null,
    justification:
      typeof rawJustification === 'string' ? rawJustification.trim() : '',
  };
}

export { readAtsScore };

export interface ParsedCouncilJudge {
  final: ResumeData;
  scores: Record<string, { atsScore: number | null; justification: string }>;
  synthesisNotes: string;
}

/**
 * Parse the council judge response. `optimizeBaseline` (optimize path) is used
 * as the normalization fallback for the merged final resume, since the judge is
 * instructed not to repeat the baseline.
 */
export function parseCouncilJudgeResponse(
  rawResponse: string,
  optimizeBaseline?: ResumeData | null,
): ParsedCouncilJudge {
  const candidates = collectJsonCandidates(rawResponse);
  const fallbackBaseline = optimizeBaseline ?? IMPORT_BASELINE;
  let sawParseableJson = false;
  let sawJudgeShape = false;
  // Graceful fallback: if only the merged resume was captured (e.g. an older
  // extension relayed the inner "final" object without the scores wrapper),
  // still apply it — scores/synthesis notes are simply marked unavailable.
  let bareFinal: ResumeData | null = null;

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const parsed = parseJsonCandidate(candidates[index]);
    if (!parsed || !isRecord(parsed)) {
      continue;
    }
    sawParseableJson = true;

    if (!isRecord(parsed.final)) {
      if (!bareFinal && looksLikeResumePayload(parsed)) {
        const candidateFinal = normalizeAiResume(parsed, fallbackBaseline, {
          enforceContactProfile: true,
        });
        if (resumeHasSubstantiveContent(candidateFinal)) {
          bareFinal = candidateFinal;
        }
      }
      continue;
    }
    sawJudgeShape = true;

    const final = normalizeAiResume(parsed.final, fallbackBaseline, {
      enforceContactProfile: true,
    });
    if (!resumeHasSubstantiveContent(final)) {
      continue;
    }

    const scores: ParsedCouncilJudge['scores'] = {};
    if (isRecord(parsed.scores)) {
      for (const [label, value] of Object.entries(parsed.scores)) {
        scores[label] = readAtsScore(value);
      }
    }

    const synthesisNotes =
      typeof parsed.synthesisNotes === 'string'
        ? parsed.synthesisNotes.trim()
        : '';

    return { final, scores, synthesisNotes };
  }

  if (bareFinal) {
    return { final: bareFinal, scores: {}, synthesisNotes: '' };
  }

  if (sawJudgeShape) {
    throw new Error(
      'The judge returned a "final" resume but it had no substantive content. Open the judge chat, confirm it finished, then try again.',
    );
  }

  if (sawParseableJson) {
    throw new Error(
      'The judge response did not include a "final" merged resume in the required JSON wrapper. Try the council run again.',
    );
  }

  throw new Error(
    'No complete judge JSON was detected. Open the judge chat, confirm it finished generating, then try again.',
  );
}

export function parseResumeFromLlmResponse(
  rawResponse: string,
  fallback: ResumeData,
): ResumeData {
  const candidate = extractJsonCandidate(rawResponse);
  let parsed: unknown;

  try {
    parsed = JSON.parse(repairJson(candidate));
  } catch {
    try {
      parsed = JSON.parse(candidate);
    } catch {
      throw new Error(
        'LLM returned invalid JSON. Open the linked chat, confirm the full ```json block finished, then try again.',
      );
    }
  }

  return normalizeAiResume(parsed, fallback);
}

export function parseStrictGeneratedResume(rawResponse: string): ResumeData {
  const candidates = collectJsonCandidates(rawResponse);
  let sawResumeShape = false;
  let sawParseableJson = false;

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const parsed = parseJsonCandidate(candidates[index]);
    if (!parsed) {
      continue;
    }

    sawParseableJson = true;
    if (!looksLikeResumePayload(parsed)) {
      continue;
    }

    sawResumeShape = true;
    const normalized = normalizeAiResume(parsed, IMPORT_BASELINE, {
      enforceContactProfile: true,
    });
    if (resumeHasSubstantiveContent(normalized)) {
      return normalized;
    }
  }

  if (sawResumeShape) {
    throw new Error(
      'Captured JSON was a resume-shaped schema or placeholder, not a real generated resume. The provider likely returned or exposed prompt text before generation completed.',
    );
  }

  if (sawParseableJson) {
    throw new Error(
      'Captured JSON was parseable but did not match the generated resume schema. Try again from a fresh chat.',
    );
  }

  throw new Error(
    'No complete generated resume JSON was detected. Try again from a fresh chat after the provider finishes generating.',
  );
}

function bulletTexts(bullets: ResumeBullet[]) {
  return bullets.map((bullet) => bullet.text);
}

function truncate(text: string, max = 72) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 1)}…`;
}

function summarizeBulletChanges(
  beforeBullets: ResumeBullet[],
  afterBullets: ResumeBullet[],
  entryLabel: string,
) {
  const changes: string[] = [];
  const maxLength = Math.max(beforeBullets.length, afterBullets.length);

  for (let index = 0; index < maxLength; index += 1) {
    const before = beforeBullets[index]?.text;
    const after = afterBullets[index]?.text;

    if (before === after) {
      continue;
    }

    const bulletNumber = index + 1;

    if (before === undefined && after !== undefined) {
      changes.push(
        `Added bullet ${bulletNumber} in ${entryLabel}: "${truncate(after)}"`,
      );
      continue;
    }

    if (before !== undefined && after === undefined) {
      changes.push(
        `Removed bullet ${bulletNumber} from ${entryLabel}: "${truncate(before)}"`,
      );
      continue;
    }

    if (before !== undefined && after !== undefined) {
      changes.push(
        `Bullet ${bulletNumber} in ${entryLabel}: "${truncate(before)}" → "${truncate(after)}"`,
      );
    }
  }

  return changes;
}

export function summarizeResumeChanges(before: ResumeData, after: ResumeData) {
  const changes: string[] = [];

  if (before.contact.name !== after.contact.name) {
    changes.push(`Name: "${before.contact.name}" → "${after.contact.name}"`);
  }

  if (JSON.stringify(before.contact.links) !== JSON.stringify(after.contact.links)) {
    changes.push('Contact links updated');
  }

  after.sections.forEach((section, index) => {
    const previous = before.sections[index];
    if (!previous) {
      changes.push(`Added section: ${section.title}`);
      return;
    }

    if (previous.title !== section.title) {
      changes.push(`Section renamed: ${previous.title} → ${section.title}`);
    }

    section.entries.forEach((entry, entryIndex) => {
      const prevEntry = previous.entries[entryIndex];
      if (!prevEntry) {
        changes.push(`Added entry in ${section.title}: ${entry.title}`);
        return;
      }

      const entryLabel = `${section.title} · ${entry.title}`;

      if (
        JSON.stringify(bulletTexts(prevEntry.bullets)) !==
        JSON.stringify(bulletTexts(entry.bullets))
      ) {
        changes.push(
          ...summarizeBulletChanges(prevEntry.bullets, entry.bullets, entryLabel),
        );
      }

      if (
        prevEntry.title !== entry.title ||
        prevEntry.subtitle !== entry.subtitle ||
        prevEntry.date !== entry.date ||
        prevEntry.location !== entry.location
      ) {
        changes.push(`Entry metadata updated: ${entryLabel}`);
      }
    });
  });

  return changes.length > 0 ? changes : ['Resume refreshed — review before applying.'];
}
