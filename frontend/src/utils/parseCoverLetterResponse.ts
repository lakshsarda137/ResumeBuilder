import type { CoverLetterData, CoverLetterParagraph } from '../types/coverLetter';
import { makeCoverLetterParagraph } from '../types/coverLetter';
import {
  generateId,
  extractJsonCandidate,
  collectJsonCandidates,
  parseJsonCandidate,
  repairJson,
  cleanGeneratedText,
  cleanGeneratedProseText,
  hasRealText,
  isRecord,
} from './parseResumeResponse';
import { ensureContactProfile } from './contactProfile';

export const EMPTY_COVER_LETTER: CoverLetterData = {
  contact: { name: '', links: [] },
  date: '',
  greeting: '',
  paragraphs: [],
  closing: '',
  signatureName: '',
};

function normalizeParagraph(raw: unknown, index: number): CoverLetterParagraph {
  if (typeof raw === 'string') {
    return makeCoverLetterParagraph(generateId(`para-${index}`), cleanGeneratedProseText(raw));
  }

  if (raw && typeof raw === 'object') {
    const para = raw as { id?: unknown; text?: unknown; jdComment?: unknown };
    const text = typeof para.text === 'string' ? cleanGeneratedProseText(para.text) : '';
    const jdComment =
      typeof para.jdComment === 'string' && para.jdComment.trim()
        ? cleanGeneratedProseText(para.jdComment)
        : undefined;
    return makeCoverLetterParagraph(
      typeof para.id === 'string' ? para.id : generateId(`para-${index}`),
      text,
      jdComment,
    );
  }

  return makeCoverLetterParagraph(generateId(`para-${index}`), '');
}

export function looksLikeCoverLetterPayload(parsed: unknown): boolean {
  if (!isRecord(parsed)) {
    return false;
  }
  return Array.isArray(parsed.paragraphs);
}

export function coverLetterHasSubstantiveContent(coverLetter: CoverLetterData): boolean {
  if (!Array.isArray(coverLetter.paragraphs) || coverLetter.paragraphs.length === 0) {
    return false;
  }
  const realParagraphs = coverLetter.paragraphs.filter((paragraph) => hasRealText(paragraph.text));
  return realParagraphs.length >= 2;
}

export function normalizeAiCoverLetter(
  raw: unknown,
  fallback: CoverLetterData,
): CoverLetterData {
  const source = isRecord(raw) ? raw : {};
  const rawContact = isRecord(source.contact) ? source.contact : undefined;

  const contact = {
    name:
      typeof rawContact?.name === 'string' && rawContact.name.trim()
        ? cleanGeneratedProseText(rawContact.name)
        : fallback.contact.name,
    links:
      Array.isArray(rawContact?.links) && rawContact.links.length > 0
        ? rawContact.links.map((link, index) => {
            const entry = isRecord(link) ? link : {};
            return {
              id:
                typeof entry.id === 'string'
                  ? entry.id
                  : fallback.contact.links[index]?.id ?? generateId(`link-${index}`),
              value: typeof entry.value === 'string' ? cleanGeneratedProseText(entry.value) : '',
            };
          })
        : fallback.contact.links,
  };

  const paragraphs = Array.isArray(source.paragraphs)
    ? source.paragraphs
        .map((paragraph, index) => normalizeParagraph(paragraph, index))
        .filter((paragraph) => paragraph.text.trim().length > 0)
    : fallback.paragraphs;

  return {
    // The header is guaranteed here rather than trusted from the model: the
    // guide's first checklist item is that the letter header matches the
    // resume header, and a missing link is silent on the page.
    contact: ensureContactProfile(contact),
    // Em dashes are allowed in the date line — do not sanitize.
    date: typeof source.date === 'string' ? cleanGeneratedText(source.date) : fallback.date,
    greeting:
      typeof source.greeting === 'string' && source.greeting.trim()
        ? cleanGeneratedProseText(source.greeting)
        : fallback.greeting,
    paragraphs: paragraphs.length > 0 ? paragraphs : fallback.paragraphs,
    closing:
      typeof source.closing === 'string' && source.closing.trim()
        ? cleanGeneratedProseText(source.closing)
        : fallback.closing,
    signatureName:
      typeof source.signatureName === 'string' && source.signatureName.trim()
        ? cleanGeneratedProseText(source.signatureName)
        : fallback.signatureName || contact.name,
  };
}

export function parseGeneratedCoverLetter(rawResponse: string): CoverLetterData {
  const candidates = collectJsonCandidates(rawResponse);
  let sawCoverLetterShape = false;
  let sawParseableJson = false;

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const parsed = parseJsonCandidate(candidates[index]);
    if (!parsed) {
      continue;
    }

    sawParseableJson = true;
    if (!looksLikeCoverLetterPayload(parsed)) {
      continue;
    }

    sawCoverLetterShape = true;
    const normalized = normalizeAiCoverLetter(parsed, EMPTY_COVER_LETTER);
    if (coverLetterHasSubstantiveContent(normalized)) {
      return normalized;
    }
  }

  if (sawCoverLetterShape) {
    throw new Error(
      'Captured JSON was a cover-letter-shaped schema or placeholder, not a real generated cover letter. The provider likely returned or exposed prompt text before generation completed.',
    );
  }

  if (sawParseableJson) {
    throw new Error(
      'Captured JSON was parseable but did not match the generated cover letter schema. Try again from a fresh chat.',
    );
  }

  throw new Error(
    'No complete generated cover letter JSON was detected. Try again from a fresh chat after the provider finishes generating.',
  );
}

export function parseCoverLetterFromLlmResponse(
  rawResponse: string,
  fallback: CoverLetterData,
): CoverLetterData {
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

  return normalizeAiCoverLetter(parsed, fallback);
}
