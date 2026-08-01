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
 * Who the resume is written for. Specifying the reader is what makes the rest
 * of the contract actionable: front-loading, plain phrasing, and metric
 * placement all follow from a semi-technical recruiter on a 10-second scan.
 */
export const RESUME_AUDIENCE_FRAME = `WHO IS READING THIS RESUME (assume this reader for every decision below):
- A recruiter or hiring coordinator screening roughly 200 resumes for this role in one sitting, spending 10-20 seconds on each one during the first pass.
- Semi-technical: they know role titles, mainstream tools and platforms (Python, React, AWS, SQL, Docker), and what "latency", "users", "uptime", and "revenue" mean. They do NOT know internal jargon, algorithm names, academic terminology, or team-specific acronyms.
- Their job on that first pass is to match this resume against the job description, not to evaluate engineering taste. Assume an engineer reads it at the next stage, so the technical substance still has to be there.

WHAT THAT MEANS IN PRACTICE:
- The first 5-8 words of every bullet must carry the accomplishment. Never open with setup, context, team background, or tooling.
- Put the number early. A metric buried at the end of a long clause is a metric the reader never reaches.
- Job-description keyword matching is the TOP priority. Keep the job description's own exact terms wherever the candidate's real experience honestly supports them, because that is what the recruiter is scanning for. But the sentence around each keyword must be plain, concrete English that a semi-technical reader can understand and be impressed by on a single read.
- This is a rule about PHRASING, not about content. Do not remove technical depth, do not water down what was actually built, and do not replace a specific system with a vague one. Keep the specifics an engineer would respect and make the wording accessible. Done right the recruiter grasps the impact immediately and the engineer still sees real work.
- Expand or drop niche acronyms on first use. Widely recognized ones (API, SQL, CI/CD, AWS, ML) can stand alone.
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
Each bullet should communicate three things:
- the ACCOMPLISHMENT: what changed, what got better, or what now exists that did not before;
- the MEASUREMENT: the number, scale, or scope that proves it;
- the METHOD: what the candidate actually did to make it happen.

Order those three whichever way reads strongest for THAT bullet. Accomplishment-first, measurement-first, and method-first are all valid. Do not lock every bullet into one ordering: a resume where all twelve bullets share the same sentence skeleton reads as machine-written and is exactly what a skimming recruiter tunes out. Vary the ordering deliberately across the resume, and for each individual bullet choose the order that puts the most impressive, most job-relevant element in the opening words.

LENGTH (a hard constraint, not a preference):
- Every bullet must be between 25 and 50 words.
- Most bullets belong at the LOW end, near 25 words. Reserve the upper end for the two or three strongest bullets on the resume.
- No bullet may run past TWO rendered lines on the page. One line is the target for a standard bullet, two for a standout. If a bullet would spill onto a third line, cut it back until it does not. A three-line bullet is a defect.
- The usual cause of an overlong bullet is a three-item method list. Name one or two methods, not every technology involved. Cut the third.
- Length is not depth. A tight 25-word bullet with a real number beats a 45-word bullet padded with tooling names.

The same accomplishment, ordered three ways:
- Accomplishment-first: "Scaled payment service throughput, reducing P99 API latency by 81% (450ms to 85ms), by adding Redis distributed caching, indexing slow database queries, and offloading heavy background tasks to asynchronous RabbitMQ workers"
- Measurement-first: "Slashed P99 API response times by 81% (450ms to 85ms) while cutting database load in half by introducing a Redis caching layer and moving non-critical tasks to async queue workers"
- Method-first: "Enforced TypeScript interfaces and authored comprehensive integration test suites, stabilizing core backend services and driving down user-facing production bugs by 40%"

Further examples of the target quality bar:
- "Reduced annual AWS cloud expenditure by $144,000 (a 35% reduction) while holding 99.99% uptime by migrating stateless microservices to Fargate, right-sizing RDS instances, and configuring Spot Instance autoscaling"
- "Accelerated engineering shipping velocity, cutting CI/CD pipeline runtimes by 82% (45 minutes down to 8), by parallelizing test suites and layering multi-stage Docker caching"
- "Cut database query latency by 15% by rewriting SQL joins, improving dashboard load times for 500 daily active users"

WHEN THE SOURCE MATERIAL HAS NO NUMBER, use this ladder in order:
1. A real metric is present in the source. Use it exactly as stated. Include the before/after pair when both are available, since "450ms to 85ms" is far more persuasive than a bare percentage.
2. No metric, but the source states scale or scope: users, records, endpoints, dataset size, team size, frequency, duration, or a count of clients, features, or services. That scope IS the measurement. "across 12 microservices", "for 500 daily users", "over a 40,000-row dataset".
3. Neither is available. Write an outcome-first bullet: name the concrete thing that changed or now exists, then the method behind it. A specific unquantified outcome beats a padded fake one.

NEVER:
- Invent, estimate, round up, extrapolate, or infer a number that is not in the source material. This rule outranks every preference for metrics above it.
- Fake precision with hedges: "~30%", "significantly", "substantially", "drastically", "roughly 2x", "notably improved".
- Pad a bullet with a measurement that measures nothing a reader cares about, such as lines of code written or meetings attended.`;

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
 * The model chooses its own emphasis. There is no user-supplied keyword list
 * and no post-generation highlighting pass: whatever ships in the JSON is
 * exactly what renders.
 */
export const RESUME_EMPHASIS_RULES = `BOLD EMPHASIS (you decide what to bold; there is no user-supplied keyword list and nothing downstream will add emphasis for you):
- Wrap emphasized text in <strong>...</strong> directly inside the bullet's text field. The JSON must carry the tags, because the renderer will never guess, highlight, or infer emphasis after generation.
- Budget: at most 3 words bolded per bullet. Zero, one, or two is equally acceptable and frequently better. Not every bullet needs emphasis. A resume where most words are bold carries no emphasis at all.
- Bold these, in priority order: (1) terms that appear in the job description or are close synonyms of them, wherever the candidate's real experience supports the match; (2) a genuinely impressive metric or outcome; (3) a recognizable brand, product, company, or platform name a semi-technical reader will immediately register; (4) a technical term that is both impressive and easy to appreciate without deep expertise.
- Do not bold generic action verbs, common words, connective filler, or long spans of a sentence. Bold the term itself, not the clause around it.
- Bold ONLY inside bullet text. Never apply <strong> to entry titles, company names, job titles, subtitles, dates, section headings, or skill category labels. The renderer already applies its own weight to those, and doubling up makes the page look muddy.
- Emphasis is bold-only. Never use <mark>, color, background, background-color, highlighting, or underline.`;

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
 * label ("President's Honor Roll (Fall 2025)") is not a date field.
 */
export const RESUME_MECHANICS_RULES = `DATE FORMAT AND PUNCTUATION (mechanical consistency):
- Every date range in an entry's date field reads "Mon YYYY – Mon YYYY", e.g. "Jun 2024 – Aug 2024": three-letter month abbreviation, four-digit year, both ends, separated by an en dash (–), not an em dash.
- An entry that is still ongoing ends its range with "Present": "Jan 2025 – Present".
- A single-point date, such as a graduation date, is just "Mon YYYY", e.g. "May 2026".
- Never write a day, a semester name ("Fall 2024"), a numeric date ("06/2024", "2024-06"), or a bare year on its own. One exception: if the source material gives only a year for an entry, keep the year rather than inventing a month. The rule against fabricating facts outranks this one.
- Use the identical format for every date field on the resume, including education. Do not mix formats.
- Bullet text never ends in a period or any other terminal punctuation, without exception, so that every bullet on the page matches. Skill rows follow the same rule.
- Commas, colons, semicolons, and parentheses inside a bullet are fine. A bullet that needs a full stop in the middle is two sentences and should be rewritten as one.`;

/**
 * The full contract, in the order the reader-then-writing-then-verbs-then-
 * emphasis-then-mechanics progression makes most sense to a model.
 */
export const RESUME_WRITING_CONTRACT = [
  RESUME_AUDIENCE_FRAME,
  BULLET_IMPACT_RULES,
  ACTION_VERB_RULES,
  RESUME_EMPHASIS_RULES,
  RESUME_MECHANICS_RULES,
].join('\n\n');
