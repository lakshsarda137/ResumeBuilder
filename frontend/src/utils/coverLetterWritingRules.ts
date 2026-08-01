/**
 * Shared cover-letter writing contract, structured the same way
 * `resumeWritingRules.ts` structures the resume one: audience frame, then
 * research, then structure, then the relationship to the resume, then voice.
 *
 * The structure rules are taken from the Rice CCD cover letter guide's sample
 * format (its page 3), minus the parts this app deliberately skips — the
 * recipient block, the company address, and the "RE:" line. The app never knows
 * the hiring manager's name, so the guide's "address a specific person"
 * instruction resolves to a fixed "Dear Hiring Team,".
 *
 * The voice rules exist because the default register of a generated cover
 * letter is the exact thing that makes it useless: inflated, feeling-claiming,
 * and interchangeable with every other letter in the pile.
 */

export const COVER_LETTER_AUDIENCE_FRAME = `WHO IS READING THIS LETTER:
- A recruiter or hiring manager who already has the candidate's resume in front of them. They will read this letter for maybe thirty seconds, and only to answer questions the resume cannot: does this person understand what we do, why do they want THIS job, and can they write.
- They have read many cover letters this week. Almost all of them opened with a sentence about being excited, said the company was excellent without naming anything about it, and restated the resume in paragraph form. A letter that does none of those three things is already better than most of the stack.
- They are not moved by enthusiasm. They are moved by evidence that the candidate understood the role and has done something relevantly hard before.`;

export const COVER_LETTER_RESEARCH_RULES = `BEFORE YOU WRITE, WORK THESE OUT FROM THE JOB DESCRIPTION (do not put this analysis in the letter — it decides what goes in it):
1. At least THREE qualifications, traits, or responsibilities the employer is actually asking for. Take them from the job description's own words.
2. For each one, the strongest concrete thing in the candidate's source material that speaks to it. If a requirement has nothing real behind it, drop that requirement and pick another — do not write around a gap with adjectives.
3. ONE specific, checkable thing about this organization or this role: the product, the problem domain, the users it serves, the stage the team is at, the technical approach named in the posting. Something you can point at.

RULES ON THE ORGANIZATION:
- Everything you say about the company must come from the JOB DESCRIPTION TEXT. You have no other reliable information about this employer, and inventing a fact about them is the single most damaging error this letter can make.
- Never call the company "excellent", "innovative", "leading", "world-class", "renowned", or "a great fit". Naming what they actually do is the whole point; praise is what people write instead of naming it.
- If the job description genuinely says nothing specific about the organization, anchor on the WORK described in the posting instead. Do not pad with admiration.`;

export const COVER_LETTER_STRUCTURE_RULES = `LETTER STRUCTURE (fixed — do not add, reorder, or rename these parts):
- HEADER: the candidate's name and contact facts, identical to the resume header.
- DATE: today's date, supplied above, written as "Month D, YYYY".
- GREETING: exactly "Dear Hiring Team,". There is no recipient block, no company address, and no "RE:" or subject line. Do not add one, and never invent a hiring manager's name.
- OPENING PARAGRAPH: state the purpose of the letter and name the position being applied for. Name the key qualification that makes the candidate credible for it. NO LONGER THAN 3-4 SENTENCES.
- BODY PARAGRAPHS (one or two): elaborate on the qualifications for this specific position. Tie each body paragraph back to something the job description actually asked for. Give specific examples that illustrate real accomplishments. Explain WHY the candidate wants this position and this organization, using the specific thing you identified above.
- CLOSING PARAGRAPH: restate interest in the role, say plainly that the candidate would welcome an interview and is available for one, give the email address and phone number so the reader can arrange it, and thank them for their consideration. Keep it to 2-3 sentences.
- SIGN-OFF: a closing line ("Sincerely," is fine) and the candidate's typed full name.

LENGTH:
- Hard one page. Three or four paragraphs total, counting the opening and closing. 300-400 words of body text is the target; past 400 it stops being read.
- Connected prose only. No bullet lists, no headings inside the letter, no bold.`;

export const COVER_LETTER_RESUME_RELATIONSHIP = `THE LETTER'S RELATIONSHIP TO THE RESUME (this is what makes the letter worth reading at all):
- The tailored resume is supplied above, and it is going to the employer WITH this letter. The reader will have both. A letter that restates the resume wastes the only chance to say something the resume could not.
- The candidate source material is far richer than what fit on the resume. One page forced out the reasoning, the constraints, the decisions, the failures, the context, and the parts that do not compress into a bullet. THAT surplus is what this letter is made of.
- You may build on at most TWO things that already appear on the resume, and when you do, you must add something the resume does not say: why the work was undertaken, what was genuinely hard about it, what the candidate decided and why, what it changed, or what they learned. Referencing an accomplishment to give it context is right; repeating it is not.
- THE SWAP TEST: if a sentence in this letter could be dropped into the resume as a bullet, or a resume bullet could be dropped into this letter, that sentence is doing no work. Rewrite or cut it.
- Never paraphrase a resume bullet. Never list technologies the way the skills section does. Never walk through the candidate's history in order — the resume already does that.
- Do not contradict the resume. Employers, titles, dates, and metrics must match it exactly.`;

export const COVER_LETTER_VOICE_RULES = `VOICE — write as a competent person explaining something plainly, not as a system generating a cover letter:
- BANNED WORDS AND PHRASES, without exception: tapestry, delve, realm, landscape (as a metaphor), testament, journey, embark, navigate (as a metaphor), foster, myriad, plethora, pivotal, seamless, synergy, ethos, cornerstone, beacon, resonate, align with my values, cutting-edge, state-of-the-art, world-class, best-in-class, unwavering, profound, invaluable, meticulous, passionate, thrilled, excited, eager, honored, humbled, deeply, truly, incredibly, immensely, uniquely positioned, perfect fit, dream job, hit the ground running, wear many hats, think outside the box, game-changer, revolutionize, transformative.
- BANNED OPENINGS: "I am writing to express my interest in...", "I am excited to apply for...", "As a passionate...", "I was thrilled to see...", "It is with great enthusiasm that...". Open with something that could only have been written about this job.
- Do not claim feelings. "I am passionate about distributed systems" is a claim no reader can check and none of them believe. Describing the thing that was actually built demonstrates the interest without asserting it.
- Do not compliment the reader or the company. State what they do and why it is worth working on.
- VARY THE SENTENCE OPENINGS. Do not start consecutive sentences with "I", and do not let more than about half the sentences in the letter start with "I" at all. Lead with the work, the problem, the result, or the timeframe instead. This is the single most reliable tell of a machine-written letter.
- Prefer short declarative sentences. Contractions are fine and read as human. Specific nouns beat abstract ones, exactly as on the resume.
- No exclamation marks. No rhetorical questions. No sentence that exists only to transition.
- Every factual claim must be supported by the resume or the candidate source material. Do not invent employers, titles, dates, tools, metrics, or interests.`;

export const COVER_LETTER_JD_COMMENT_RULES = `JOB-DESCRIPTION MATCH COMMENTS (required where applicable):
- Add "jdComment" to a paragraph when it makes a GENUINE match to something the job description asks for. Cite the specific requirement or keyword and explain the real connection.
- Be honest. Do not claim a match the source material does not support, and do not stretch one to fill the field.
- Omit "jdComment" entirely for a paragraph with no honest match — for example a closing paragraph that is purely a call to action.
- These notes are for the candidate's review inside the app. They are never printed on the letter, so write them as plain notes, not as prose that has to sound good.`;

/** The full contract, in the order that reads most naturally to a model. */
export const COVER_LETTER_WRITING_CONTRACT = [
  COVER_LETTER_AUDIENCE_FRAME,
  COVER_LETTER_RESEARCH_RULES,
  COVER_LETTER_STRUCTURE_RULES,
  COVER_LETTER_RESUME_RELATIONSHIP,
  COVER_LETTER_VOICE_RULES,
].join('\n\n');
