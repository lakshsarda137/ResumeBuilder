/**
 * Council draft angles (repository path).
 *
 * Every candidate used to receive the identical prompt, so different models
 * produced near-identical drafts: the same entries, the same framing, similar
 * wording. The judge's merge had little to choose between and mostly picked
 * one. Each candidate now takes a deliberate angle on the two decisions that
 * actually differ between good drafts — which work to lead with, and which
 * reader to write for — so the judge merges genuinely different material.
 *
 * Both angles still follow the full shared writing contract. The angle only
 * changes where the draft starts and whose eyes it writes for.
 */
import type { CandidateLabel } from '../types/council';

export type CouncilDraftAngle = 'jd-first-recruiter' | 'work-first-engineer';

/** Slot order → angle. A third candidate, if any, runs the unangled prompt. */
const SLOT_ANGLES: CouncilDraftAngle[] = ['jd-first-recruiter', 'work-first-engineer'];

export function councilAngleForSlot(index: number): CouncilDraftAngle | null {
  return SLOT_ANGLES[index] ?? null;
}

export function councilAngleLabel(angle: CouncilDraftAngle | null | undefined): string | null {
  if (angle === 'jd-first-recruiter') return 'JD-first · recruiter';
  if (angle === 'work-first-engineer') return 'Work-first · engineer';
  return null;
}

/** The angle block inserted near the top of a candidate's repository prompt. */
export function buildCouncilAngleBlock(angle: CouncilDraftAngle): string {
  if (angle === 'jd-first-recruiter') {
    return `YOUR ANGLE FOR THIS DRAFT — JD-FIRST, WRITTEN FOR THE RECRUITER:
This is one of two independent drafts for the same job. The other draft starts from the candidate's most impressive work and writes for the hiring engineer. A judge will merge the two, so commit fully to your angle rather than hedging toward the middle.
- START FROM THE JOB DESCRIPTION. Before writing, list for yourself what the role is asking for: the hard requirements, the named tools and domains, and the kind of work the team does. Then go through the source material and find the candidate's best evidence for each one. Entry selection, entry order, and what each entry leads with all follow from that list.
- WRITE FOR THE RECRUITER'S 10-SECOND SCAN. The reader is matching this page against the job description. Use the job description's own terms where the work supports them, and make sure every entry is instantly recognisable: a reader skimming only the first bullet of each entry should be able to say what each project or job was and how it lines up with the role.`;
  }
  return `YOUR ANGLE FOR THIS DRAFT — WORK-FIRST, WRITTEN FOR THE HIRING ENGINEER:
This is one of two independent drafts for the same job. The other draft starts from the job description's requirements and writes for the recruiter's scan. A judge will merge the two, so commit fully to your angle rather than hedging toward the middle.
- START FROM THE CANDIDATE'S WORK. Before writing, rank the source material by how impressive the work genuinely is: hard problems solved, real scale, real users, depth of what was built, ownership. Lead with the strongest work, then connect it to the job description in the job description's own terms wherever the connection is real.
- WRITE FOR THE ENGINEER WHO READS THIS AFTER THE RECRUITER. Keep the technical substance that makes the work credible to someone who does this job: what the system does, the hard part of building it, the design decision or technique that made it work, and what it achieved. Say it in plain sentences, and still make every entry recognisable from its first bullet.
- Do not include an entry only because it matches a keyword if stronger work would have to be cut for it.`;
}

/**
 * Judge-side description of the angles. Only emitted when at least one
 * candidate carried an angle.
 */
export function buildCouncilAngleMergeBlock(
  candidates: Array<{ label: CandidateLabel; angle?: CouncilDraftAngle | null }>,
): string {
  const angled = candidates.filter((candidate) => candidate.angle);
  if (angled.length === 0) {
    return '';
  }
  const lines = candidates.map((candidate) => {
    if (candidate.angle === 'jd-first-recruiter') {
      return `- Candidate ${candidate.label} was written JD-FIRST FOR THE RECRUITER: it selected and framed the work around the job description's requirements and optimised for a 10-second recruiter scan.`;
    }
    if (candidate.angle === 'work-first-engineer') {
      return `- Candidate ${candidate.label} was written WORK-FIRST FOR THE HIRING ENGINEER: it led with the candidate's most impressive work and kept the technical substance an engineer would respect.`;
    }
    return `- Candidate ${candidate.label} was written with no specific angle.`;
  });

  return `HOW THE DRAFTS DIFFER (by design — each candidate was given a different angle; you still do not know which system wrote which):
${lines.join('\n')}

MERGING THE ANGLES: the drafts are meant to cover each other's blind spots, so the final resume should keep what each angle does best rather than picking one draft wholesale.
- The JD-first draft is your guide to requirement coverage, the job description's vocabulary, and how to make each entry instantly recognisable on a skim. Its weakness is filling space with weaker work because it matches a requirement.
- The work-first draft is your guide to which work is genuinely strongest and to the substance that makes it credible. Its weakness is leaving requirements uncovered or describing strong work in terms the recruiter cannot connect to the role.
- Decide entry by entry and bullet by bullet. Where both drafts cover the same work, the best bullet often combines the recognisable framing and job-description terms of one with the substance of the other.`;
}
