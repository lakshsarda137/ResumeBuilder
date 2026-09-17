import { PERSONAL } from '../personal';

const EX = PERSONAL.promptExamples;

/**
 * Shared resume-writing contract.
 *
 * These blocks used to be copy-pasted (and had drifted) across the repository
 * build prompt, the PDF optimize prompt, the council judge prompt, and the
 * expand prompt. Every path that produces resume bullets now composes the same
 * constants from here, so a change lands everywhere at once.
 *
 * This matters most for the council: the judge writes the resume that actually
 * ships, so it must be held to the identical contract as the candidates.
 */

/**
 * Who the resume is written for. There are two readers, and each bullet is
 * written for one of them: the FIRST bullet of an entry for a non-technical
 * screener, every later bullet for a technical hiring manager. Specifying the
 * readers is what makes the rest of the contract actionable.
 */
export const RESUME_AUDIENCE_FRAME = `WHO IS READING THIS RESUME (two readers; every bullet is written for exactly one of them):
- READER 1 reads the FIRST bullet of every entry: a recruiter who majored in English or psychology, NOT computer science, screening roughly 200 resumes in one sitting at 10-20 seconds each. They know what an app, a website, a chatbot, users, and "faster" mean. They do NOT know framework names, algorithm names, architecture terms, or acronyms. The first bullet must tell this reader, in plain everyday English, WHAT the candidate built, WHO it was built for, HOW it works (described in plain words, not tool names), and the headline metric when there is a relevant one. Plain does not mean fluffy: no filler, no vague praise, every word concrete.
- READER 2 reads every LATER bullet: a technical hiring manager deciding whether the engineering is real. These bullets go into the tech stack, the system design, the hard problems solved, and the true engineering feats, named precisely (frameworks, languages, infrastructure, algorithms, architecture decisions, scale). Do not dumb these down.
- EXCEPTION: an experience entry whose source covers several separate projects (an internship where the candidate shipped multiple distinct things) has no single "thing built" to explain, so the Reader 1 rule does not apply to it. Each of its bullets covers one project, names that project first, and may go straight into technical substance.

THE GOAL IS TO IMPRESS THAT HUMAN IN THE FIRST FIVE SECONDS, not to satisfy a checklist:
- The most persuasive facts on a student resume are the ones that show someone else already selected or validated this candidate: acceptance into a selective program or accelerator (with its acceptance rate), awards, competition results, real user counts, publications, being chosen for a role. Put each such fact where it is read FIRST. Selection into an accelerator or program goes on the TOP line, right beside the entry's name, in the entry's "titleNote" field (e.g. title "${EX.accelerator.title}", titleNote "${EX.accelerator.titleNote}"), never on the subtitle line below. Awards and user counts for a project go in its first bullet. Never leave one at the tail of a bullet about something else, and never drop it to make room for a tool name.
- In the first bullet, describe the discipline in words Reader 1 understands ("${EX.plainDiscipline[0]}", "${EX.plainDiscipline[1]}"). The precise field name and mechanics (${EX.technicalMechanics}) belong in the later bullets, where Reader 2 is looking for them.

WHAT THAT MEANS IN PRACTICE:
- The first 5-8 words of every bullet must name the concrete thing the candidate built or changed. Never open with setup, context, team background, or tooling, and never open with a number the reader cannot yet attach to anything.
- Test for every first bullet: would an English major, reading only that sentence, be able to tell a friend what the candidate made, who it helps, and roughly how it works? If they would stumble on a single word, replace that word.
- Put the number right after the thing it measures. A metric buried at the end of a long clause is a metric the reader never reaches; a metric before its object is a number the reader cannot interpret.
- Job-description keywords belong mainly in the later bullets and the skills section, where Reader 2 and the keyword scan both look. Keep the job description's own exact terms wherever the candidate's real experience honestly supports them. In a first bullet, a technical keyword appears only if Reader 1 would still understand the sentence; otherwise it moves to a later bullet.
- The plain first bullet is a rule about PHRASING, not about content. Do not water down what was actually built. The technical depth is not removed, it moves to the later bullets. Done right, the recruiter grasps the project immediately and the engineer still sees real work.
- In later bullets, expand niche acronyms on first use. Widely recognized ones (API, SQL, CI/CD, AWS, ML) can stand alone.
- Prefer concrete nouns over abstractions: "checkout page", "payment service", "nightly billing report" beat "the system", "the pipeline", "the platform".`;

/**
 * Accomplishment / measurement / method, with an explicit fallback ladder.
 *
 * The ladder exists because repository freewrites frequently contain no
 * numbers, and a hard "every bullet must be measured" mandate is a standing
 * invitation to fabricate metrics, which would undercut the evidence-fidelity
 * guardrails elsewhere in the prompt.
 */
export const BULLET_IMPACT_RULES = `HOW TO WRITE EVERY BULLET:
Each bullet carries exactly ONE piece of work and says three things about it, in this default order:
1. WHAT — the concrete thing the candidate built, changed, or fixed, named as a plain noun a recruiter can picture. Use the candidate's own words for the thing from the source material; do not rename it. Without this the reader cannot tell what the candidate did. SAY WHAT KIND OF THING IT IS BEFORE ITS NAME: a proper or internal name ("${EX.internalNames[0]}", "${EX.internalNames[1]}", "${EX.internalNames[2]}") tells an outsider nothing, so lead with the kind of thing and what it does ("${EX.kindOfThing[0]}", "${EX.kindOfThing[1]}") and let the name follow if it matters.
2. RESULT — the outcome that proves it mattered. A number belongs here only when it is genuinely impressive (a before/after pair like "${EX.beforeAfter}", real scale like ${EX.scale[0]} or ${EX.scale[1]}, a hard win rate). About HALF the bullets in an entry carry a number; the other half state a concrete outcome in words: what now works, what was replaced, what the reader could use. A page where every bullet ends in a percentage reads as manufactured, and small or ordinary numbers (a 12% gain, 3 endpoints, 2 weeks) weaken a bullet rather than strengthen it. Leave those out.
3. HOW — in the FIRST bullet, how it works in plain words for Reader 1 ("${EX.plainHow}"), with no framework or tool names. In LATER bullets, HOW is the substance for Reader 2: the tech stack, the architecture, the design decision and why it was made, the hard problem and how it was solved, named precisely. The method never displaces the WHAT: every bullet still opens by naming the specific component or feature it is about.

Order: WHAT (or WHAT+RESULT fused) comes first in the overwhelming majority of bullets, because a recruiter must know what the object is before a number about it means anything. The FIRST bullet of an entry never leads with a metric or a method, without exception (see the anchor rule below). In later bullets, leading with the metric is allowed only when the metric is the single most impressive fact in the entry AND the object is named within the next five words. Never lead with the method.

THE ONE-SUBJECT RULE (a hard constraint — violating it is the most damaging thing a bullet can do):
- A bullet describes one system, one feature, or one problem. Never fuse two distinct pieces of work into one sentence, however tidy the word count looks. A bullet that diagnoses bugs in one codebase, then rebuilds a second component, then ships an unrelated dashboard is THREE pieces of work; a reader finishes it unable to say what any of them was. Give each its own bullet, and cut the weakest if the bullet budget has no room for it.
- When a source describes several distinct workstreams (an internship that covered three separate products, say), decide first how many bullets each workstream earns from its impact and job relevance, then write each bullet inside its workstream. A workstream that earns no bullet is omitted; it is never squeezed as a clause into another workstream's bullet.
- Two facts about the SAME system may share a bullet only when one explains the other (a result and the method that produced it). Two independent results about the same system are two bullets.

READ-BACK TEST: after writing each bullet, ask the question for its reader. First bullet: "could an English major, having read only this sentence, say in plain words what was built, for whom, and how it works?" Later bullet: "would a technical manager learn something specific about how it was engineered?" If the answer is a tool name or a number but not a thing, or a vague restatement of the first bullet, rewrite it.

LENGTH (a hard constraint, not a preference): IF A BULLET OCCUPIES A LINE, IT FILLS THE WHOLE LINE.
- A rendered line holds about 21 words (roughly 125 characters). A line that is 10%, 50%, or 70% full is wasted space and reads as unfinished. Every line a bullet touches, including its last line, must be more than 85% full.
- So every bullet is exactly ONE of two shapes, chosen before writing:
  (a) ONE full line: 18-21 words.
  (b) TWO full lines: 40-42 words. Not 34, not 38: a 2-line bullet under 40 words leaves its second line partly empty.
- Any other length is a defect: 1-17 words (a half-empty line), 22-39 words (a partly empty second line), and 43+ words (spills onto a third line). COUNT THE WORDS of every bullet before emitting the JSON. If a bullet lands outside both bands, add real substance (a metric, a design detail, who used it) or cut it to one line. Never pad with filler to reach the count.
- If a bullet runs long, the cause is almost always a second subject. Split the subjects.
- Length is not depth. A full one-line bullet that names the thing and states one real outcome beats a padded two-line one.

WHICH NUMBERS TO USE, when a bullet does carry one:
1. A real metric from the source, exactly as stated, with the before/after pair when both are available.
2. Otherwise real scale or scope from the source (machines, users, records, dataset size, team size), only when the figure is large enough to impress.
3. Otherwise no number: a WHAT-first bullet naming the concrete thing that changed or now exists, then one method. A specific unquantified outcome beats a padded or unimpressive number, and is the intended form for roughly half the bullets.

NEVER:
- Invent, estimate, round up, extrapolate, or infer a number that is not in the source material. This rule outranks every preference for metrics above it.
- Fake precision with hedges: "~30%", "significantly", "substantially", "drastically", "roughly 2x", "notably improved".
- Pad a bullet with a measurement that measures nothing a reader cares about, such as lines of code written or meetings attended.`;

/**
 * Entry-level clarity. The bullet rules above govern one sentence at a time;
 * this block governs whether the ENTRY as a whole tells the reader what the
 * job or project actually was. Without it, drafts open every entry on a metric
 * and a reader finishes a project section unable to name a single project.
 */
export const RESUME_CLARITY_RULES = `WHAT EACH ENTRY IS (the reader must be able to say it in one sentence):
- HARD RULE, checked before anything else: the FIRST bullet of every experience and project entry is the anchor bullet, written for Reader 1 (the English or psychology major). It says, in plain everyday words, what was built, who it was built for, how it works, and the headline metric if one is relevant. Its first five words name the thing that was built, in plain nouns, using the name the source material gives the thing rather than a paraphrase (if the source calls it ${EX.sourceTermName}, the resume calls it ${EX.sourceTermName}). When that name is a proper or internal name rather than a description, the kind of thing comes first and the name after, so the opening words still tell a stranger what was built. It then says who or what it was for and gives the headline result in the same sentence. An entry whose first bullet opens with a speed-up, a percentage, a count, or a technique is WRONG even when that fact is the most impressive one in the entry: keep the fact, move it after the noun. A reader who stops after the anchor bullet must be able to describe the project to a colleague; drafts that fail this leave the reader unable to name a single project on the page.
- The difference: a first bullet that opens with the thing and its audience, then the result, anchors; one that opens with the result and names the thing late, or only as a tech stack, does not.
- OWNERSHIP IS PART OF THE ANCHOR. When the source states the candidate's scope ("${EX.ownership[0]}", "${EX.ownership[1]}", "${EX.ownership[2]}", "${EX.ownership[3]}"), that fact goes into the anchor bullet or the subtitle line, never dropped. For a student this is what separates building something from sitting on a team that built it, and drafts routinely lose it in favor of a tool name.
- Within an entry, bullets are ordered by strength: the anchor bullet carries the entry's most impressive work, and the weakest bullet comes last. Chronology and the order of the source notes do not matter.
- The anchor bullet must say what the project IS in terms a non-specialist recognises (what kind of thing it is and what it does for whom). Its technical idea is stated only in plain words ("an AI that learned the game by playing itself"); the named techniques, tools, and implementation details go in the later bullets.
- EXCEPTION: an experience entry whose source covers several distinct projects (for example an internship where the candidate shipped separate products) has no single anchor. Each of its bullets covers one project and names it first; the plain-English anchor requirement does not apply.
- LATER BULLETS are for Reader 2, the technical manager: name the stack, the architecture, the design trade-offs, and the hard engineering problems solved. A later bullet that only restates the first bullet in different words is wasted.
- Every later bullet names its own concrete subject in its first few words (the specific component, pipeline, or feature by name), so a reader always knows which part of the entry it is about. Pronoun-free: never "it", "the system", "the platform" when a specific noun exists.
- The WHAT is not the tech stack. Naming Python, React, and PostgreSQL tells the reader nothing about what the software does. In later bullets the tools explain HOW a named component was built; a bullet whose only nouns are tools fails the read-back test.
- Prefer describing behaviour over architecture: say what the thing does for its users before naming the pattern it implements. Keep the architecture word only if it is a job-description keyword.
- Before emitting the JSON, read the bullets of each entry in order and write, for yourself, one sentence saying what that entry was. If you cannot, the anchor bullet is wrong; rewrite it before anything else.`;

/**
 * Verb bank curated from the standard action-verb sheets, trimmed to the five
 * categories that matter for this tool and with the banned verbs stripped out
 * so the bank never contradicts the blacklist.
 */
export const ACTION_VERB_RULES = `ACTION VERBS:
- Start every bullet with an action verb. No bullet may open with a noun phrase, a gerund, or "Responsible for".
- TENSE FOLLOWS THE ENTRY'S DATES. An entry that is still ongoing — its date range ends in "Present", or the source material gives it no end date — takes PRESENT tense in every one of its bullets ("Build", "Lead", "Maintain"). Every entry that has ended takes PAST tense ("Built", "Led", "Maintained"). Decide the tense once per entry from its dates, then apply it to all of that entry's bullets: a single past-tense bullet under a current role makes the whole role read as finished.
- No leading verb may repeat ANYWHERE in the resume, not merely within a section. Track which verbs you have already spent and choose a fresh one each time. A verb counts as spent in either tense — if one bullet opens with "Build", no other bullet may open with "Built". If you genuinely run out of natural options, restructure the bullet rather than reaching for an obscure or inflated word: an awkward verb costs more than a repeat would.
- BANNED as a leading verb, without exception, in either tense: worked on, helped, assisted, responsible for, utilized, participated in, contributed to, involved in, developed, implemented. "Develop" is as banned as "developed". These say nothing about what the candidate actually did.
- Draw on this bank when you need range. It is a starting palette, not a whitelist, and it is written in past tense — convert to present tense for an ongoing entry. A sharper, more precise verb that genuinely fits the work always beats a merely unused one. Plain, direct verbs beat thesaurus reaches: prefer "built" over "fabricated", "designed" over "devised", "led" over "spearheaded".
  TECHNICAL: built, engineered, designed, automated, optimized, rearchitected, programmed, upgraded, solved, debugged, shipped, integrated
  MANAGEMENT: led, coordinated, consolidated, delegated, executed, prioritized, oversaw, streamlined, directed, attained
  RESEARCH: analyzed, diagnosed, evaluated, examined, extracted, identified, investigated, surveyed, systematized, critiqued
  COMMUNICATION: authored, collaborated, negotiated, presented, translated, arranged, moderated, drafted, influenced, promoted
  ACCOMPLISHMENTS: achieved, expanded, improved, pioneered, reduced, resolved, restored, spearheaded, accelerated, eliminated
- Match the verb category to the actual work: a backend refactor is TECHNICAL, running a team is MANAGEMENT, a literature review is RESEARCH. Never reach for a management verb to inflate individual-contributor work.
- Before emitting the JSON, read back the leading verb of every bullet in order. Confirm that no verb appears twice in any tense, that none is on the banned list, and that each entry's verbs are in the tense its dates call for. Rewrite anything that fails.`;

/**
 * Generic-language ban.
 *
 * ACTION_VERB_RULES already blocks empty *leading* verbs ("responsible for",
 * "helped", "worked on"), but nothing governed the filler that accumulates in
 * the middle of a bullet — the "robust scalable solution" register. The cover
 * letter has carried a banned-word list since it shipped; the resume did not,
 * even though a bullet is where the padding costs the most, because the page is
 * one page and every filler adjective evicts a real noun.
 *
 * Every banned item here is a word that survives deletion: strike it and the
 * sentence loses nothing. That is the actual test, and it is stated in the rule
 * so the model can apply it to words the list does not name.
 */
export const RESUME_PLAIN_LANGUAGE_RULES = `NO GENERIC LANGUAGE — every word must survive the deletion test:
- THE TEST: strike the word out and re-read the bullet. If the meaning is unchanged, the word was decoration and does not belong on a one-page resume. A filler adjective always costs a real noun somewhere else on the page.
- BANNED, without exception, anywhere in a bullet, an entry title, or a skill row: robust, scalable (unless you state the actual scale reached), seamless, seamlessly, comprehensive, cutting-edge, state-of-the-art, best-in-class, world-class, industry-leading, innovative, novel (unless the source says it was published or patented), powerful, efficient (unless you state the measured gain), highly, extremely, very, incredibly, significantly, substantially, greatly, successfully, effectively, efficiently, seamlessly, meticulously, passionate, dedicated, motivated, detail-oriented, results-oriented, results-driven, self-starter, team player, hard-working, dynamic, synergy, leverage (as a verb meaning "use"), utilize, spearheaded (prefer "led"), strategic thinker, cross-functional (name the actual teams instead), holistic, seamless integration, end-to-end (unless you name both ends), mission-critical, best practices, cutting edge.
- "Successfully" is the clearest case: every bullet on a resume describes something that succeeded. The word adds nothing and signals padding.
- NEVER CLAIM A QUALITY — SHOW THE EVIDENCE FOR IT. "Built a robust pipeline" asserts robustness and proves nothing. "Held the pipeline at 99.9% uptime across 40,000 nightly records" is the same claim with evidence, and it is shorter than the reader's doubt. The same applies to "efficient", "scalable", "reliable", and "optimized": replace the adjective with the number that earned it, or cut the adjective.
- NEVER DESCRIBE THE CANDIDATE. A resume bullet describes work, not personality. No bullet may characterise the candidate as passionate, driven, collaborative, or a fast learner. Traits are inferred by the reader from the work; asserted, they read as filler and cost a line.
- Do not name a technology that played no real part just to lengthen a method clause. If the bullet reads the same without it, cut it — this is the deletion test applied to nouns.
- Before emitting the JSON, re-read every bullet once looking only for words from the banned list and for adjectives that assert a quality without evidence. Delete or replace each one. Deleting filler frees words — spend them on a number or a concrete noun, not on a longer sentence.`;

/**
 * No bold in content. The renderer bolds the candidate's name, entry names,
 * and section headings on its own; everything the model writes stays at body
 * weight, and resumeHouseStyle.ts strips any bold that slips through.
 */
export const RESUME_EMPHASIS_RULES = `NO BOLD (a hard rule):
- Never bold anything you write. No <strong>, no <b>, no font-weight styling, anywhere: not in bullets, subtitles, title notes, skill rows, dates, or contact links.
- The only bold on the page is the candidate's name, the names of experiences and projects, and the section headings (Education, Experience, ...). The renderer applies that weight itself, so you never mark it up.
- Never use <mark>, color, background, highlighting, or underline either. Emphasis comes from word order: the most impressive fact goes first.`;

/**
 * Date format and terminal punctuation — the two mechanical conventions a
 * reader registers as sloppiness before reading a word of content.
 *
 * Neither was stated anywhere in the assembled prompt before, so the model
 * free-formed `entry.date` out of raw `YYYY-MM` source dates and drifted on
 * bullet punctuation within a single resume. It matters most for the council:
 * the judge assembles one resume out of three drafts and would otherwise
 * inherit three different habits in the same document.
 *
 * Scoped to date FIELDS on purpose — a semester that is part of an honors
 * label ("Dean's List (Fall 2025)") is not a date field.
 */
export const RESUME_MECHANICS_RULES = `DATE FORMAT AND PUNCTUATION (mechanical consistency):
- Every date range in an entry's date field reads "Mon YYYY – Mon YYYY", e.g. "Jun 2024 – Aug 2024": three-letter month abbreviation, four-digit year, both ends, separated by an en dash (–), not an em dash.
- An entry that is still ongoing ends its range with "Present": "Jan 2025 – Present".
- EDUCATION SHOWS ONLY THE GRADUATION DATE, never the start date. A degree still in progress reads "Mon YYYY (Expected Graduation)", e.g. "May 2029 (Expected Graduation)" or "May 2028 (Expected Graduation)". A completed degree reads just "Mon YYYY". Writing a range such as "Aug 2025 – May 2029" on a school entry is a defect.
- A single-point date is reserved for one-off items such as a certification or an award, and is just "Mon YYYY".
- Never write a day, a semester name ("Fall 2024"), a numeric date ("06/2024", "2024-06"), or a bare year on its own. One exception: if the source material gives only a year for an entry, keep the year rather than inventing a month. The rule against fabricating facts outranks this one.
- Use the identical format for every experience and project date field. Do not mix formats.
- EVERY experience, project, and custom-section bullet ENDS WITH A FULL STOP (period), without exception, so that every bullet on the page matches. Education detail lines (GPA, coursework) and skill rows are lists, not sentences, and take no period.
- Commas, colons, semicolons, and parentheses inside a bullet are fine. A bullet that needs a full stop in the middle is two sentences and should be rewritten as one.`;

/**
 * Page layout conventions the model controls through the JSON: header links,
 * the title-line note, locations, and the skills section.
 */
export const RESUME_LAYOUT_RULES = `PAGE LAYOUT (hard rules):
- HEADER LINE (the line under the name): never show a full LinkedIn or GitHub URL. Each is a contact link whose "value" is the URL and whose "label" is the word shown on the page, hyperlinked: { "value": "linkedin.com/in/<handle>", "label": "LinkedIn" } and { "value": "github.com/<handle>", "label": "GitHub" }. Email and phone have no label. Nothing on the header line is bold.
- NO LOCATION ON EXPERIENCE OR PROJECTS: every experience entry (internships, jobs, startups) and every project entry has "location": "". No city, no state, no "Remote", no exceptions. Only an education entry may carry a location.
- TITLE NOTE: when an experience entry was selected into an accelerator or selective program (e.g. ${EX.accelerator.programName}), that fact goes in the entry's "titleNote" field so it renders on the top line beside the entry's name, e.g. title "${EX.accelerator.title}", titleNote "${EX.accelerator.titleNote}". Keep it under 8 words so the top line still fits the date. It never goes in the subtitle or a bullet. Leave "titleNote" out when there is no such fact.
- SKILLS SECTION: exactly TWO rows, each fitting on ONE line (at most about 110 characters including the label). Row 1 has label "Languages" (programming languages only). Row 2 has label "Tools" (frameworks, libraries, databases, cloud, and developer tools). No other rows or labels. Choose the items most relevant to the job description and drop the rest to stay on one line.`;

/**
 * The full contract, in the order the reader-then-writing-then-verbs-then-
 * emphasis-then-mechanics-then-layout progression makes most sense to a model.
 */
export const RESUME_WRITING_CONTRACT = [
  RESUME_AUDIENCE_FRAME,
  BULLET_IMPACT_RULES,
  RESUME_CLARITY_RULES,
  ACTION_VERB_RULES,
  RESUME_PLAIN_LANGUAGE_RULES,
  RESUME_EMPHASIS_RULES,
  RESUME_MECHANICS_RULES,
  RESUME_LAYOUT_RULES,
].join('\n\n');
