/**
 * Recruiter read — a cold 10-second skim of the finished resume.
 *
 * Every model that writes or merges the resume has the freewrite repository in
 * front of it, so none of them can read a bullet the way a stranger does: they
 * already know what "the ingestion service" is. This send deliberately gets
 * ONLY the resume as rendered text and the job description, in a fresh chat, and
 * answers the one question that matters on a first pass: after ten seconds, who
 * is this person?
 *
 * It is a signal for the user, not a gate. Nothing is rewritten from it; the
 * editor shows the summary and the user decides whether the page says what they
 * built.
 */
import type { AiProvider } from './aiProviders';
import type { AiChatSession } from '../types/aiSession';
import type { ResumeData } from '../types/resume';
import type { BridgeResponse } from '../hooks/useAiBridge';
import { sendLargePromptAndWait, type LargePromptSenders } from './promptDelivery';
import { plainText } from './latex';
import { saveAiSession } from './aiSessionStorage';

export const RECRUITER_READ_TASK_FILENAME = 'recruiter-read-task.txt';

export type RecruiterReadStatus = 'idle' | 'reading' | 'done' | 'failed';

/** Persisted with a history session so the read survives a reload. */
export interface RecruiterReadResult {
  summary: string;
  provider: AiProvider;
}

/**
 * The resume as a skimming reader sees it: headings, entry lines, bullets, and
 * skills. Bold spans stay marked, because the bold text is exactly what a
 * 10-second reader's eye lands on.
 */
export function resumeToSkimText(resume: ResumeData): string {
  const withBold = (html: string) =>
    plainText(html.replace(/<(strong|b)\b[^>]*>/gi, '**').replace(/<\/(strong|b)>/gi, '**'));

  const lines: string[] = [];
  const name = plainText(resume.contact.name);
  if (name) {
    lines.push(name);
  }

  for (const section of resume.sections) {
    const heading = plainText(section.title);
    lines.push('', (heading || section.type).toUpperCase());

    for (const entry of section.entries) {
      const header = [entry.title, entry.subtitle, entry.location, entry.date]
        .map((part) => plainText(part ?? ''))
        .filter(Boolean)
        .join(' | ');
      if (header) {
        lines.push(header);
      }
      for (const bullet of entry.bullets) {
        const text = withBold(bullet.text);
        if (text) {
          lines.push(`- ${text}`);
        }
      }
    }

    for (const skill of section.skills ?? []) {
      const label = plainText(skill.label);
      const items = plainText(skill.items);
      if (label || items) {
        lines.push(label ? `${label}: ${items}` : items);
      }
    }
  }

  return lines.join('\n').trim();
}

export function buildRecruiterReadPrompt(resume: ResumeData, jobDescription: string): string {
  const jd = jobDescription.trim();
  const jdBlock = jd
    ? `THE JOB YOU ARE SCREENING FOR:
"""
${jd}
"""`
    : 'No job description was supplied. Screen as a generalist technical recruiter.';

  return `You are a recruiter screening about 200 resumes for one role in a single sitting. You give each resume a 10-second skim before deciding whether it goes to the hiring team. You are semi-technical: you know role titles, mainstream tools, and what users, latency, and revenue mean, but you do not know internal project names, team jargon, or niche acronyms.

${jdBlock}

THE RESUME (plain text as it appears on the page; **double asterisks** mark bold text):
"""
${resumeToSkimText(resume)}
"""

YOUR TASK:
Skim this resume the way you really would in 10 seconds: your eye lands on the entry lines, the first words of bullets, and the bold text. Do not study it. Then write 1-2 plain sentences saying what this person is all about: who they are, what they have actually built or done, and what stands out. Write only what the page communicated to you in that skim. If you could not tell what something was, do not guess at it; your summary should reflect only what came across.

No headings, no bullet points, no scoring, no advice.

OUTPUT FORMAT: write a line reading ---JSON-START---, then one JSON object with a single key named summary whose value is your 1-2 sentence summary as a string, then a line reading ---JSON-END---. Nothing else before or after.`;
}

export function buildRecruiterReadCoverPrompt(filename: string): string {
  return `The attached file "${filename}" contains your COMPLETE task as a recruiter skimming a resume. Read the ENTIRE file and follow every instruction in it exactly.

Reply with ONLY the output the file specifies: one JSON object with a single "summary" string, wrapped exactly between a line reading ---JSON-START--- and a line reading ---JSON-END---. Nothing else.`;
}

/**
 * Last delimited block carrying a summary string. The capture can hand back the
 * whole page, prompt included, so an earlier block is never trusted over a later
 * one — and the prompt itself deliberately contains no parseable example.
 */
export function parseRecruiterReadResponse(raw: string): string {
  const blocks = [...raw.matchAll(/---JSON-START---\s*([\s\S]*?)\s*---JSON-END---/g)];
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const body = blocks[index][1].replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
    try {
      const parsed = JSON.parse(body) as { summary?: unknown };
      if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
        return parsed.summary.trim();
      }
    } catch {
      // Try the next block back.
    }
  }

  const loose = /"summary"\s*:\s*"((?:[^"\\]|\\.)+)"/.exec(raw);
  if (loose) {
    try {
      return (JSON.parse(`"${loose[1]}"`) as string).trim();
    } catch {
      return loose[1].trim();
    }
  }

  throw new Error('The recruiter read did not come back in the expected format.');
}

export interface RecruiterReadRunArgs {
  provider: AiProvider;
  resume: ResumeData;
  jobDescription: string;
  incognito?: boolean;
  senders: LargePromptSenders<BridgeResponse>;
  onAttachFailed?: (message: string) => void;
}

export async function runRecruiterRead({
  provider,
  resume,
  jobDescription,
  incognito,
  senders,
  onAttachFailed,
}: RecruiterReadRunArgs): Promise<{ summary: string; session: AiChatSession | null }> {
  const response = await sendLargePromptAndWait({
    provider,
    prompt: buildRecruiterReadPrompt(resume, jobDescription),
    coverPrompt: buildRecruiterReadCoverPrompt(RECRUITER_READ_TASK_FILENAME),
    filename: RECRUITER_READ_TASK_FILENAME,
    incognito,
    senders,
    onAttachFailed,
  });
  if (!response.rawResponse) {
    throw new Error(response.error ?? 'No response captured.');
  }
  const summary = parseRecruiterReadResponse(response.rawResponse);
  const session = response.session ?? null;
  if (session) {
    saveAiSession(session);
  }
  return { summary, session };
}
