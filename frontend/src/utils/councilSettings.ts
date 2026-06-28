import type {
  KeyedRubricDimension,
  RubricDimension,
} from '../types/council';

const STORAGE_KEY = 'resume-council-settings';

/** Default rubric dimensions shipped in Settings; users can edit these. */
export const DEFAULT_RUBRIC: RubricDimension[] = [
  {
    id: 'jd-alignment',
    title: 'JD alignment',
    description: 'How well the resume targets the specific job description.',
  },
  {
    id: 'evidence-fidelity',
    title: 'Evidence fidelity',
    description:
      'Truthfulness to the source material; metrics and facts preserved, nothing invented.',
  },
  {
    id: 'clarity',
    title: 'Clarity',
    description: 'Scanability, structure, and bullet quality.',
  },
  {
    id: 'one-page-fit',
    title: 'One-page fit',
    description: 'Density and appropriateness for a single page.',
  },
  {
    id: 'overall-quality',
    title: 'Overall quality',
    description: 'Holistic hireability and polish.',
  },
];

interface CouncilSettings {
  rubric: RubricDimension[];
}

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function sanitizeDimension(raw: unknown, index: number): RubricDimension | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const dim = raw as Partial<RubricDimension>;
  const title = typeof dim.title === 'string' ? dim.title.trim() : '';
  const description =
    typeof dim.description === 'string' ? dim.description.trim() : '';
  if (!title) {
    return null;
  }
  return {
    id:
      typeof dim.id === 'string' && dim.id.trim()
        ? dim.id
        : generateId(`dim-${index}`),
    title,
    description,
  };
}

export function sanitizeRubric(value: unknown): RubricDimension[] {
  if (!Array.isArray(value)) {
    return DEFAULT_RUBRIC.map((dim) => ({ ...dim }));
  }
  const cleaned = value
    .map((item, index) => sanitizeDimension(item, index))
    .filter((item): item is RubricDimension => Boolean(item));
  return cleaned.length > 0 ? cleaned : DEFAULT_RUBRIC.map((dim) => ({ ...dim }));
}

export function loadCouncilSettings(): CouncilSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { rubric: DEFAULT_RUBRIC.map((dim) => ({ ...dim })) };
    }
    const parsed = JSON.parse(stored) as Partial<CouncilSettings>;
    return { rubric: sanitizeRubric(parsed.rubric) };
  } catch {
    return { rubric: DEFAULT_RUBRIC.map((dim) => ({ ...dim })) };
  }
}

export function loadDefaultRubric(): RubricDimension[] {
  return loadCouncilSettings().rubric;
}

export function saveDefaultRubric(rubric: RubricDimension[]) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ rubric: sanitizeRubric(rubric) }),
    );
  } catch {
    // Local persistence is best-effort.
  }
}

export function createRubricDimension(): RubricDimension {
  return { id: generateId('dim'), title: '', description: '' };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/**
 * Attach a stable, unique machine `key` to each dimension for the judge
 * prompt/response contract. Empty-titled dimensions are dropped.
 */
export function keyRubric(rubric: RubricDimension[]): KeyedRubricDimension[] {
  const used = new Set<string>();
  const keyed: KeyedRubricDimension[] = [];
  rubric.forEach((dim, index) => {
    if (!dim.title.trim()) {
      return;
    }
    let key = slugify(dim.title) || `dimension_${index + 1}`;
    if (used.has(key)) {
      key = `${key}_${index + 1}`;
    }
    used.add(key);
    keyed.push({ ...dim, key });
  });
  return keyed;
}
