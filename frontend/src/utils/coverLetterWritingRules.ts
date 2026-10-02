import { PERSONAL } from '../personal';

/**
 * Shared cover-letter writing contract, structured the same way
 * `resumeWritingRules.ts` structures the resume one: audience frame, then
 * research, then structure, then the relationship to the resume, then voice.
 *
 * The structure rules follow a university career center cover letter guide:
 * its sample format (page 3) for the parts of the letter, and its paragraph
 * plan for what each part carries — an opening that says who the candidate is
 * and names the employer and the exact role, body paragraphs that carry the
 * substance and reference the resume and technical background, and a closing
 * that answers "why this employer", shows fit with the team, asks for the
 * interview, and signs off with appreciation.
 *
 * Skipped deliberately: the recipient block, the company address, and the
 * "RE:" line. The app never knows the hiring manager's name, so the guide's
 * "address a specific person" instruction resolves to a fixed
 * "Dear Hiring Team,". The guide's opening also offers a list of adjectives to
 * describe yourself ("proactive / accountable / agile"); those are exactly the
 * unverifiable self-ratings the voice rules ban, so the opening carries the
 * same information as evidence instead.
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
3. ONE specific, checkable thing about this organization or this role: the product, the problem domain, the users it serves, the stage the team is at, the technical approach named in the posting. Something you can point at. This is what the closing paragraph's "why this employer" is built from.
4. ONE thing the posting says about how the team WORKS: how they collaborate, who they build for, what they value in an engineer, the environment they describe. The closing paragraph uses this to show the candidate fits the team, so it must come from the posting's own words. If the posting says nothing about this, use the work itself and say nothing about culture.

RULES ON THE ORGANIZATION:
- Everything you say about the company must come from the JOB DESCRIPTION TEXT. You have no other reliable information about this employer, and inventing a fact about them is the single most damaging error this letter can make.
- Never call the company "excellent", "innovative", "leading", "world-class", "renowned", or "a great fit". Naming what they actually do is the whole point; praise is what people write instead of naming it.
- If the job description genuinely says nothing specific about the organization, anchor on the WORK described in the posting instead. Do not pad with admiration.`;

export const COVER_LETTER_STRUCTURE_RULES = `LETTER STRUCTURE (fixed — do not add, reorder, or rename these parts):
- HEADER: the candidate's name and contact facts, identical to the resume header.
- DATE: today's date, supplied above, written as "Month D, YYYY".
- GREETING: exactly "Dear Hiring Team,". There is no recipient block, no company address, and no "RE:" or subject line. Do not add one, and never invent a hiring manager's name.
- OPENING PARAGRAPH (who the candidate is, and what they are applying for): 3-4 sentences carrying four things, woven into ONE connected thought rather than four facts set down side by side:
  1. WHO THE CANDIDATE IS, in one plain phrase: what they are and where ("a computer science student at <school>", "a backend engineer"). The header already gives the name, so do not open with "My name is".
  2. THE DEPTH BEHIND THAT: how long they have been doing this kind of work, or the scale of it, taken from the source material. State it as a fact ("two summers of backend work on production systems"), never as a self-rating.
  3. THE EMPLOYER AND THE ROLE, BY NAME, in the form "to support <employer> as a <exact role title from the posting>" or a natural equivalent. Both names must appear in this paragraph.
  4. WHY THE CANDIDATE IS CREDIBLE FOR IT: the single strongest relevant thing they have done. Concrete, not a claim about themselves.
  A bare standalone "I'm applying for the X position." dropped between two other ideas is the most common way this paragraph fails.
- BODY PARAGRAPHS (one or two, the substance of the letter): this is where the real content goes. Each paragraph takes one qualification the job description asked for and shows the candidate meeting it with a specific example. Point the reader to the resume for the record and use the space to give what the resume could not hold: why the work was undertaken, what was hard, what was decided, what changed. Cover the relevant technical background here, in plain sentences, not as a list of tools.
- CLOSING PARAGRAPH (why this employer, and the last impression): 3-4 sentences, in this order:
  1. WHY THIS EMPLOYER: the specific, checkable thing about the organization or the work identified above, and why it is worth the candidate's effort. This answers "why us rather than anyone else" and is the paragraph's main job.
  2. FIT WITH THE TEAM: one sentence connecting how this candidate works to what the posting says about how the team works, evidenced by something they have actually done. Show the match through the example itself and never point at the posting to make it. Skip this sentence entirely when the posting says nothing about the team; never invent a culture.
  3. THE ASK: that the candidate would welcome an interview and is available for one, with the email address and phone number so the reader can arrange it.
  4. APPRECIATION: thank the reader for their time and consideration. End on it. The last sentence of the letter is a thank-you, never a restatement of interest.
- SIGN-OFF: a closing line ("Sincerely," is fine) and the candidate's typed full name.

LENGTH:
- Hard one page. Three or four paragraphs total: the opening, one or two body paragraphs, and the closing. 300-400 words of body text is the target; past 400 it stops being read.
- Connected prose only. No bullet lists, no headings inside the letter, no bold.`;

export const COVER_LETTER_RESUME_RELATIONSHIP = `THE LETTER'S RELATIONSHIP TO THE RESUME (this is what makes the letter worth reading at all):
- The tailored resume is supplied above, and it is going to the employer WITH this letter. The reader will have both. A letter that restates the resume wastes the only chance to say something the resume could not.
- The candidate source material is far richer than what fit on the resume. One page forced out the reasoning, the constraints, the decisions, the failures, the context, and the parts that do not compress into a bullet. THAT surplus is what this letter is made of.
- You may build on at most TWO things that already appear on the resume, and when you do, you must add something the resume does not say: why the work was undertaken, what was genuinely hard about it, what the candidate decided and why, what it changed, or what they learned. Referencing an accomplishment to give it context is right; repeating it is not.
- THE SWAP TEST: if a sentence in this letter could be dropped into the resume as a bullet, or a resume bullet could be dropped into this letter, that sentence is doing no work. Rewrite or cut it.
- Never paraphrase a resume bullet. Never list technologies the way the skills section does. Never walk through the candidate's history in order — the resume already does that.
- Do not contradict the resume. Employers, titles, dates, and metrics must match it exactly.
- NEVER NAME THE CANDIDATE'S OWN EMPLOYERS, STARTUPS, OR PROJECTS. The resume already carries those names; in the letter they are noise to a reader who has never heard of them. Refer to each one by what it was: "at my previous internship", "at my startup", "in a project I built for students at my school". The employer this letter is addressed to is the one exception and must still be named, as the structure rules require.`;

export const COVER_LETTER_VOICE_RULES = `VOICE — write as a competent person explaining something plainly, not as a system generating a cover letter:
- BANNED WORDS AND PHRASES, without exception: tapestry, delve, realm, landscape (as a metaphor), testament, journey, embark, navigate (as a metaphor), foster, myriad, plethora, pivotal, seamless, synergy, ethos, cornerstone, beacon, resonate, align with my values, cutting-edge, state-of-the-art, world-class, best-in-class, unwavering, profound, invaluable, meticulous, passionate, thrilled, excited, eager, honored, humbled, deeply, truly, incredibly, immensely, uniquely positioned, perfect fit, dream job, hit the ground running, wear many hats, think outside the box, game-changer, revolutionize, transformative.
- ALSO BANNED, the quieter machine tells: silently, quietly, effortlessly, elegantly, gracefully, seamlessly, robust, leverage, harness, elevate, empower, streamline, underscore, showcase, spearhead, honed, fueled, sparked, ignite, dive deep, deep dive, "at the intersection of", "in today's fast-paced", "ever-evolving", "rapidly evolving", "more than just", "isn't just", "whether it's X or Y", "a testament to", "speaks to", "I believe", "I'm confident that", "I look forward to the opportunity", "keep coming back to" (and every conjugation of it: "I keep coming back to", "keeps coming back to", "kept coming back to", "what I come back to"), "come back to" in any form (including "is the part I want to come back to"), "lived" in any sense ("lived in the codebase", "lived with the problem", "where the work lived"), "broke" in any sense ("what broke", "it broke on", "broke the problem down"). Adverbs that describe HOW something was done (silently, quietly, carefully, thoughtfully, meticulously) are the most recognizable AI habit of all: describe what was done and let the reader judge the how.
- NEVER DEFINE SOMETHING BY WHAT IT IS NOT. The contrastive-negation sentence is banned in every form: "not X, but Y", "not just X, but Y", "it isn't X; it's Y", "X is less about A than about B", "rather than X, Y", "more than X, it is Y", "X, not Y". This includes the version split across two sentences ("The hard part wasn't the model. It was the data."). State the positive claim on its own: "the data was the hard part". The construction reads as written by a machine, and it spends half a sentence on something the reader was never thinking.
- No rhetorical triplets of abstractions ("scale, reliability, and impact"). Name one concrete thing instead of three vague ones.
- BANNED OPENINGS: "I am writing to express my interest in...", "I am excited to apply for...", "As a passionate...", "I was thrilled to see...", "It is with great enthusiasm that...". Open with something that could only have been written about this job.
- Do not claim feelings. "I am passionate about distributed systems" is a claim no reader can check and none of them believe. Describing the thing that was actually built demonstrates the interest without asserting it.
- Do not compliment the reader or the company. State what they do and why it is worth working on.
- NEVER CITE THE JOB POSTING. No "the posting says", "the role calls for", "the job description mentions", "you're looking for someone who", or any sentence shaped like "you want X, and I have done X". Matching each requirement out loud reads as a checklist. Show fit by talking about the employer's actual work and the candidate's actual experience in the same terms, so the reader makes the connection without being told. Name the problem the team works on and describe having solved a similar one.
- VARY THE SENTENCE OPENINGS, but not at the cost of the sentence. Aim for under half the sentences starting with "I", and never three in a row. Lead with the work, the problem, the result, or the timeframe instead. HOWEVER: if the only way to avoid "I" is a front-loaded modifier before the subject — "${PERSONAL.promptExamples.coverLetterFrontLoadLong}" — then start with "I". A contorted sentence is a worse tell than a repeated pronoun. Never open a sentence with a long appositive or participial phrase describing a subject that has not been named yet.
- Contractions are fine and read as human. Specific nouns beat abstract ones, exactly as on the resume.
- No exclamation marks. No rhetorical questions. No sentence that exists ONLY to announce a transition and carries no content of its own ("Furthermore, it is worth noting that..."). This is not a ban on connecting one sentence to the next — see the readability rules below, which require it.
- Every factual claim must be supported by the resume or the candidate source material. Do not invent employers, titles, dates, tools, metrics, or interests.`;

/**
 * Added after real output came back technically compliant and painful to read:
 * every rule was obeyed and the letter still lurched between ideas one sentence
 * at a time, because nothing in the contract asked for cohesion. Compression
 * rules alone ("prefer short sentences", "no transition sentences", "vary the
 * openings") optimise each sentence in isolation and strip the connective
 * tissue that makes a paragraph followable. These rules govern how sentences
 * relate to each other, and they are the counterweight to the voice rules.
 */
export const COVER_LETTER_READABILITY_RULES = `READABILITY — a human has to be able to read this straight through, once, without re-reading:
- ONE POINT PER PARAGRAPH. Decide the single thing a paragraph is about before writing it. The first sentence states or sets up that point; every later sentence in the paragraph develops the SAME point. When you have a second thing to say, start a new paragraph.
- EVERY SENTENCE MUST CONNECT TO THE ONE BEFORE IT. The reader should never have to work out why a sentence is where it is. If a sentence introduces a new subject, a new project, a new company, or a new period of time, say so in the sentence itself rather than dropping it in and expecting the reader to catch up.
- NO ORPHAN SENTENCES. A sentence that is a bare fact with no link to either neighbour is the defect this rule exists to stop. Merge it into an adjacent sentence, give it a real connection, or cut it.
- ESTABLISH BEFORE YOU ELABORATE. Name who or what you are talking about before you attach descriptions, dates, or credentials to it. Do not describe a subject the sentence has not introduced.
- VARY SENTENCE LENGTH DELIBERATELY. Mix short sentences with medium ones. No sentence over about 35 words, and never two long complex sentences back to back — that is where the reader loses the thread. A short sentence after a long one is the strongest tool you have.
- ONE IDEA PER SENTENCE. Do not stack a nested clause, an appositive, and a trailing qualifier into one sentence to save space. If a sentence needs to be read twice, split it.
- READ THE FINISHED PARAGRAPH ALOUD IN YOUR HEAD. If you stumble, run out of breath, or have to back up to work out what a pronoun or a modifier attaches to, rewrite that sentence. Sounding like a person is a requirement, not a finishing touch.
- Density is not the goal. A letter that says three things clearly beats one that says six things the reader cannot follow. If the word budget forces a choice, cut a point rather than compressing every point past the point of readability.

FLUIDITY — this reader is moving fast, and a sentence only gets one pass:
- WRITE FOR SOMEONE SKIMMING. They are giving this letter thirty seconds and will not slow down for a sentence that does not give way immediately. Every sentence has to land on the first read, at speed. A sentence that is merely correct, and rewards a second reading, has already failed here.
- SUBJECT AND VERB EARLY, AND TOGETHER. Start the sentence with who or what is doing something, and get to the verb fast. Do not open with a long wind-up — a date, a condition, a subordinate clause, a string of prepositions — before the main clause arrives. A reader who has to hold six words in suspense before learning what the sentence is about will skip it.
- KEEP RELATED WORDS NEXT TO EACH OTHER. Do not split a subject from its verb, or a verb from its object, with an inserted clause. The reader should never be holding one half of a thought while waiting for the other.
- CARRY THE THREAD FORWARD. End a sentence on the idea the next one picks up, so each sentence hands off to the one after it. This is what makes a paragraph read as one motion instead of a list of true statements.
- PEOPLE AND THINGS DO THINGS. Active voice, with a concrete subject. "The retry logic moved to the transaction log" reads faster than "a decision was made to relocate the retry logic".
- ORDINARY WORDS, EVERY TIME. Use the word you would use out loud: "used" over "utilized", "about" over "regarding", "so" over "accordingly", "showed" over "demonstrated". Formal vocabulary slows a skimmer down and buys nothing.
- NO CLAUSE PILE-UPS. One main clause, at most one subordinate clause. No semicolons stitching two full sentences together, no parenthetical asides, no trailing qualifier bolted onto a finished thought. If you need the qualifier, it is a sentence of its own or it is cut.`;

export const COVER_LETTER_JD_COMMENT_RULES = `JOB-DESCRIPTION MATCH COMMENTS (required where applicable):
- Add "jdComment" to a paragraph when it makes a GENUINE match to something the job description asks for. Cite the specific requirement or keyword and explain the real connection.
- Be honest. Do not claim a match the source material does not support, and do not stretch one to fill the field.
- Omit "jdComment" entirely for a paragraph with no honest match — for example a closing paragraph that is purely a call to action.
- These notes are for the candidate's review inside the app. They are never printed on the letter, so write them as plain notes, not as prose that has to sound good.`;

/**
 * The full contract, in the order that reads most naturally to a model.
 * Readability comes last on purpose: it is the pass that has to survive
 * everything above it, and the voice rules immediately before it are the ones
 * whose over-application it exists to correct.
 */
export const COVER_LETTER_WRITING_CONTRACT = [
  COVER_LETTER_AUDIENCE_FRAME,
  COVER_LETTER_RESEARCH_RULES,
  COVER_LETTER_STRUCTURE_RULES,
  COVER_LETTER_RESUME_RELATIONSHIP,
  COVER_LETTER_VOICE_RULES,
  COVER_LETTER_READABILITY_RULES,
].join('\n\n');
