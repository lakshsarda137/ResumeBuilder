/**
 * Bulk job-description parser.
 *
 * A "doc dump" is one blob of text holding many job descriptions, each
 * demarcated by a line like `Job Description 3` (optionally followed by the
 * company / role on the same line). We split on those markers and keep every
 * line between one marker and the next as that job's text.
 *
 * Pure + side-effect free so it can be unit-tested and run live on every
 * keystroke without touching the network.
 */

export interface ParsedJobDescription {
  /** The integer from the `Job Description N` marker (authoritative, from the user). */
  number: number;
  /**
   * Company / role label — taken from the rest of the marker line, else the
   * first non-empty body line. For the user's reference; editable downstream.
   */
  label: string;
  /** The full job-description body between this marker and the next. */
  text: string;
}

export interface BulkParseResult {
  jobs: ParsedJobDescription[];
  /** True when the text is non-empty but no `Job Description N` markers were found. */
  markerless: boolean;
  /** Text before the first marker (usually a heading/preamble; not part of any job). */
  preamble: string;
}

/**
 * Matches a marker line: optional leading spaces, "job description" (any case,
 * flexible inner spacing), an optional "#", the integer, then optional
 * separators (":", "-", "—", ".", ")") and the rest of the line (company/role).
 * `m` flag anchors ^/$ to line boundaries so a mid-sentence "...job description
 * 5..." never matches — only a line that STARTS with the marker.
 */
const MARKER_RE =
  /^[ \t]*job[ \t]*description[ \t]*#?[ \t]*(\d+)[ \t]*[:.)\-–—]*[ \t]*(.*)$/gim;

function firstNonEmptyLine(body: string): string {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

export function parseBulkJobDescriptions(raw: string): BulkParseResult {
  const text = (raw ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const markers: Array<{
    index: number;
    lineEnd: number;
    number: number;
    sameLine: string;
  }> = [];

  const re = new RegExp(MARKER_RE.source, MARKER_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    markers.push({
      index: match.index,
      lineEnd: match.index + match[0].length,
      number: Number.parseInt(match[1], 10),
      sameLine: (match[2] ?? '').trim(),
    });
    // Guard against a zero-length match looping forever.
    if (match.index === re.lastIndex) re.lastIndex += 1;
  }

  if (markers.length === 0) {
    const trimmed = text.trim();
    return { jobs: [], markerless: trimmed.length > 0, preamble: trimmed };
  }

  const preamble = text.slice(0, markers[0].index).trim();

  const jobs: ParsedJobDescription[] = markers.map((marker, i) => {
    const bodyStart = marker.lineEnd;
    const bodyEnd = i + 1 < markers.length ? markers[i + 1].index : text.length;
    // Keep the full span between markers (lossless) — including a company line
    // the user may have put under the marker — then just trim surrounding blanks.
    const body = text.slice(bodyStart, bodyEnd).replace(/^\n+/, '').trim();
    const label = (marker.sameLine || firstNonEmptyLine(body)).slice(0, 140);
    return { number: marker.number, label, text: body };
  });

  return { jobs, markerless: false, preamble };
}

/**
 * Fallback for a markerless dump the user chooses to treat as a single job.
 */
export function singleJobFromText(raw: string): ParsedJobDescription {
  const text = (raw ?? '').trim();
  return { number: 1, label: firstNonEmptyLine(text).slice(0, 140), text };
}
