import type { ResumeSection } from '../types/resume';

/**
 * Section ordering shared by the on-screen renderer and the LaTeX generator,
 * so the PDF never disagrees with the preview about which section comes first.
 */
export function normalizeSectionOrderLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\btechnical\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sectionOrderAliases(section: ResumeSection) {
  const aliases = new Set<string>();
  aliases.add(normalizeSectionOrderLabel(section.title));
  aliases.add(normalizeSectionOrderLabel(section.type));

  if (section.type === 'skills') {
    aliases.add('skills');
  }

  return aliases;
}

export function orderSectionsForDisplay(
  sections: ResumeSection[],
  headings: string[],
) {
  const ranks = new Map<string, number>();
  headings.forEach((heading, index) => {
    const normalized = normalizeSectionOrderLabel(heading);
    if (normalized) {
      ranks.set(normalized, index);
    }
  });

  return [...sections].sort((left, right) => {
    const leftRanks = [...sectionOrderAliases(left)]
      .map((alias) => ranks.get(alias))
      .filter((rank): rank is number => rank !== undefined);
    const rightRanks = [...sectionOrderAliases(right)]
      .map((alias) => ranks.get(alias))
      .filter((rank): rank is number => rank !== undefined);
    const leftRank = leftRanks.length > 0 ? Math.min(...leftRanks) : Number.MAX_SAFE_INTEGER;
    const rightRank = rightRanks.length > 0 ? Math.min(...rightRanks) : Number.MAX_SAFE_INTEGER;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return sections.indexOf(left) - sections.indexOf(right);
  });
}
