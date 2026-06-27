import { type CSSProperties, useCallback, useMemo, useState } from 'react';
import type { ResumeData, ResumeEntry, ResumeSection } from '../types/resume';
import { bulletText, makeBullet } from '../types/resume';
import {
  mergeResumeRenderSettings,
  type ResumeRenderSettings,
} from '../utils/resumeSettings';
import { EditableText } from './EditableText';
import './ResumeDocument.css';

interface ResumeDocumentProps {
  data: ResumeData;
  onChange: (data: ResumeData, immediateHistory?: boolean) => void;
  editing?: boolean;
  id?: string;
  settings?: ResumeRenderSettings;
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function cssFontFamily(name: string) {
  const normalized = name.trim();
  if (!normalized) {
    return "'Times New Roman', Times, 'Liberation Serif', serif";
  }
  const lower = normalized.toLowerCase();
  if (
    lower.includes('arial') ||
    lower.includes('calibri') ||
    lower.includes('helvetica') ||
    lower.includes('inter') ||
    lower.includes('sans')
  ) {
    return `'${normalized.replace(/'/g, '')}', Arial, Helvetica, sans-serif`;
  }
  return `'${normalized.replace(/'/g, '')}', Times, 'Liberation Serif', serif`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function emphasizeKeywords(html: string, keywords: string[]) {
  if (!html || html.includes('<strong')) {
    return html;
  }

  const terms = keywords
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .sort((a, b) => b.length - a.length);

  if (terms.length === 0) {
    return html;
  }

  const matcher = new RegExp(`\\b(${terms.map(escapeRegExp).join('|')})\\b`, 'gi');
  return html
    .split(/(<[^>]+>)/g)
    .map((part) =>
      part.startsWith('<') ? part : part.replace(matcher, '<strong>$1</strong>'),
    )
    .join('');
}

function editableValue(
  value: string,
  settings: ResumeRenderSettings,
  enableKeywords = false,
) {
  if (settings.defaultTemplate !== 'keyword' || !enableKeywords) {
    return value;
  }
  return emphasizeKeywords(value, settings.keywordTerms);
}

function grayscaleFromIntensity(intensity: number) {
  const channel = Math.round(255 * (1 - intensity / 100));
  return `rgb(${channel}, ${channel}, ${channel})`;
}

function normalizeSectionOrderLabel(value: string) {
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

function orderSectionsForDisplay(
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

export function ResumeDocument({
  data,
  onChange,
  editing = true,
  id = 'resume-document',
  settings,
}: ResumeDocumentProps) {
  const [hoveredEntry, setHoveredEntry] = useState<string | null>(null);
  const effectiveSettings = useMemo(
    () => mergeResumeRenderSettings(settings),
    [settings],
  );
  const displaySections = useMemo(
    () => orderSectionsForDisplay(data.sections, effectiveSettings.sectionHeadings),
    [data.sections, effectiveSettings.sectionHeadings],
  );

  const pageStyle = useMemo(
    () =>
      ({
        '--resume-body-font': cssFontFamily(effectiveSettings.bodyFontFamily),
        '--resume-name-font': cssFontFamily(effectiveSettings.nameFontFamily),
        '--resume-heading-font': cssFontFamily(effectiveSettings.headingFontFamily),
        '--resume-name-size': `${effectiveSettings.nameFontSize}pt`,
        '--resume-heading-size': `${effectiveSettings.headingFontSize}pt`,
        '--resume-body-size': `${effectiveSettings.bodyFontSize}pt`,
        '--resume-bullet-size': `${effectiveSettings.bulletFontSize}pt`,
        '--resume-bullet-indent': `${effectiveSettings.bulletIndent}pt`,
        '--resume-text-color': grayscaleFromIntensity(effectiveSettings.textIntensity),
        '--resume-rule-color': grayscaleFromIntensity(effectiveSettings.ruleIntensity),
        '--resume-body-weight': effectiveSettings.bodyTextWeight,
        '--resume-bold-weight': effectiveSettings.boldTextWeight,
        '--resume-strong-weight': effectiveSettings.strongTextWeight,
        '--resume-line-height': effectiveSettings.lineHeight,
        '--resume-page-padding-top': `${effectiveSettings.pagePaddingTop}in`,
        '--resume-page-padding-left': `${effectiveSettings.pagePaddingLeft}in`,
        '--resume-page-padding-right': `${effectiveSettings.pagePaddingRight}in`,
        '--resume-page-padding-bottom': `${effectiveSettings.pagePaddingBottom}in`,
        '--resume-section-spacing': `${effectiveSettings.sectionSpacing}pt`,
        '--resume-section-header-spacing': `${effectiveSettings.sectionHeaderSpacing}pt`,
        '--resume-entry-spacing': `${effectiveSettings.entrySpacing}pt`,
        '--resume-name-weight': effectiveSettings.boldTextWeight,
        '--resume-section-title-weight': effectiveSettings.sectionHeadingBold
          ? effectiveSettings.boldTextWeight
          : effectiveSettings.bodyTextWeight,
        '--resume-section-title-style': effectiveSettings.sectionHeadingItalic ? 'italic' : 'normal',
        '--resume-section-title-transform': effectiveSettings.sectionHeadingUppercase ? 'uppercase' : 'none',
        '--resume-entry-title-weight': effectiveSettings.entryTitleBold
          ? effectiveSettings.boldTextWeight
          : effectiveSettings.bodyTextWeight,
        '--resume-entry-title-style': effectiveSettings.entryTitleItalic ? 'italic' : 'normal',
        '--resume-subtitle-style': effectiveSettings.subtitleItalic ? 'italic' : 'normal',
        '--resume-date-weight': effectiveSettings.dateBold
          ? effectiveSettings.boldTextWeight
          : effectiveSettings.bodyTextWeight,
        '--resume-date-style': effectiveSettings.dateItalic ? 'italic' : 'normal',
        '--resume-skill-label-weight': effectiveSettings.skillLabelBold
          ? effectiveSettings.boldTextWeight
          : effectiveSettings.bodyTextWeight,
      }) as CSSProperties,
    [effectiveSettings],
  );

  const emitChange = useCallback(
    (newData: ResumeData, immediateHistory = false) => {
      onChange(newData, immediateHistory);
    },
    [onChange],
  );

  const updateContactName = useCallback(
    (value: string) => {
      emitChange({
        ...data,
        contact: { ...data.contact, name: value },
      });
    },
    [data, emitChange],
  );

  const updateContactLink = useCallback(
    (linkId: string, value: string) => {
      emitChange({
        ...data,
        contact: {
          ...data.contact,
          links: data.contact.links.map((link) =>
            link.id === linkId ? { ...link, value } : link,
          ),
        },
      });
    },
    [data, emitChange],
  );

  const addContactLink = useCallback(() => {
    emitChange(
      {
        ...data,
        contact: {
          ...data.contact,
          links: [
            ...data.contact.links,
            { id: generateId(), value: 'github.com/username' },
          ],
        },
      },
      true,
    );
  }, [data, emitChange]);

  const removeContactLink = useCallback(
    (linkId: string) => {
      emitChange(
        {
          ...data,
          contact: {
            ...data.contact,
            links: data.contact.links.filter((link) => link.id !== linkId),
          },
        },
        true,
      );
    },
    [data, emitChange],
  );

  const updateSection = useCallback(
    (
      sectionId: string,
      updater: (section: ResumeSection) => ResumeSection,
      immediateHistory = false,
    ) => {
      emitChange(
        {
          ...data,
          sections: data.sections.map((s) =>
            s.id === sectionId ? updater(s) : s,
          ),
        },
        immediateHistory,
      );
    },
    [data, emitChange],
  );

  const updateEntry = useCallback(
    (
      sectionId: string,
      entryId: string,
      updater: (entry: ResumeEntry) => ResumeEntry,
      immediateHistory = false,
    ) => {
      updateSection(
        sectionId,
        (section) => ({
          ...section,
          entries: section.entries.map((e) =>
            e.id === entryId ? updater(e) : e,
          ),
        }),
        immediateHistory,
      );
    },
    [updateSection],
  );

  const addBullet = (sectionId: string, entryId: string) => {
    updateEntry(
      sectionId,
      entryId,
      (entry) => ({
        ...entry,
        bullets: [...entry.bullets, makeBullet('New bullet point')],
      }),
      true,
    );
  };

  const removeBullet = (
    sectionId: string,
    entryId: string,
    bulletIndex: number,
  ) => {
    updateEntry(
      sectionId,
      entryId,
      (entry) => ({
        ...entry,
        bullets: entry.bullets.filter((_, i) => i !== bulletIndex),
      }),
      true,
    );
  };

  const addEntry = (sectionId: string) => {
    updateSection(
      sectionId,
      (section) => ({
        ...section,
        entries: [
          ...section.entries,
          {
            id: generateId(),
            title:
              section.type === 'experience'
                ? 'Company Name'
                : section.type === 'projects'
                  ? 'Project Name'
                  : 'Organization Name',
            location: section.type === 'experience' ? '' : 'City, ST',
            date: 'Month Year – Present',
            subtitle:
              section.type === 'experience'
                ? 'Job Title | Technologies'
                : 'Role | Technologies',
            bullets: [makeBullet('Describe your impact here.')],
          },
        ],
      }),
      true,
    );
  };

  const removeEntry = (sectionId: string, entryId: string) => {
    updateSection(
      sectionId,
      (section) => ({
        ...section,
        entries: section.entries.filter((e) => e.id !== entryId),
      }),
      true,
    );
  };

  const addSkillCategory = (sectionId: string) => {
    updateSection(
      sectionId,
      (section) => ({
        ...section,
        skills: [
          ...(section.skills ?? []),
          { id: generateId(), label: 'Category', items: 'Skill, Skill, Skill' },
        ],
      }),
      true,
    );
  };

  const removeSkillCategory = (sectionId: string, skillId: string) => {
    updateSection(
      sectionId,
      (section) => ({
        ...section,
        skills: section.skills?.filter((s) => s.id !== skillId),
      }),
      true,
    );
  };

  return (
    <div className="resume-page-wrapper">
      <div
        className={`resume-page resume-page--${effectiveSettings.defaultTemplate}${editing ? '' : ' resume-page--print'}`}
        id={id}
        style={pageStyle}
      >
      <header className="resume-header">
        <EditableText
          tag="h1"
          className="resume-name"
          value={data.contact.name}
          onChange={updateContactName}
          placeholder="Your Name"
          editing={editing}
        />
        <p className="resume-contact resume-contact-line">
          {data.contact.links.map((link, index) => (
            <span key={link.id} className="resume-contact-inline">
              {index > 0 && (
                <span className="resume-contact-sep" aria-hidden>
                  {' | '}
                </span>
              )}
              <EditableText
                tag="span"
                className="resume-contact-text"
                value={link.value}
                onChange={(v) => updateContactLink(link.id, v)}
                placeholder="email, phone, or URL"
                editing={editing}
              />
              {editing && data.contact.links.length > 1 && (
                <button
                  type="button"
                  className="resume-control resume-control--remove-contact"
                  onClick={() => removeContactLink(link.id)}
                  title="Remove contact link"
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </p>
        {editing && (
          <button
            type="button"
            className="resume-control resume-control--rail"
            data-rail="contact"
            onClick={addContactLink}
          >
            + link
          </button>
        )}
      </header>

      {displaySections.map((section) => (
        <section key={section.id} className="resume-section">
          <div
            className="resume-section-header"
            {...(section.jdComment
              ? { 'data-jd-anchor': `section-${section.id}` }
              : {})}
          >
            <EditableText
              tag="h2"
              className="resume-section-title"
              value={section.title}
              onChange={(v) =>
                updateSection(section.id, (s) => ({ ...s, title: v }))
              }
              placeholder="Section Title"
              editing={editing}
            />
          </div>

          {section.type === 'skills' && section.skills ? (
            <div className="resume-skills">
              {section.skills.map((skill) => (
                <div
                  key={skill.id}
                  className="resume-skill-row"
                  {...(skill.jdComment
                    ? {
                        'data-jd-anchor': `skill-${section.id}-${skill.id}`,
                      }
                    : {})}
                >
                  {editing && (
                    <button
                      type="button"
                      className="resume-control resume-control--remove"
                      onClick={() =>
                        removeSkillCategory(section.id, skill.id)
                      }
                      title="Remove skill category"
                    >
                      ×
                    </button>
                  )}
                  <EditableText
                    tag="span"
                    className="resume-skill-label"
                    value={skill.label}
                    onChange={(v) =>
                      updateSection(section.id, (s) => ({
                        ...s,
                        skills: s.skills?.map((sk) =>
                          sk.id === skill.id ? { ...sk, label: v } : sk,
                        ),
                      }))
                    }
                    placeholder="Category"
                    editing={editing}
                  />
                  <span className="resume-skill-colon">: </span>
                  <EditableText
                    tag="span"
                    className="resume-skill-items"
                    value={skill.items}
                    displayValue={editableValue(
                      skill.items,
                      effectiveSettings,
                      true,
                    )}
                    onChange={(v) =>
                      updateSection(section.id, (s) => ({
                        ...s,
                        skills: s.skills?.map((sk) =>
                          sk.id === skill.id ? { ...sk, items: v } : sk,
                        ),
                      }))
                    }
                    placeholder="Skills list"
                    editing={editing}
                  />
                </div>
              ))}
              {editing && (
                <button
                  type="button"
                  className="resume-control resume-control--rail"
                  data-rail="skill"
                  onClick={() => addSkillCategory(section.id)}
                >
                  + skill
                </button>
              )}
            </div>
          ) : (
            <div className="resume-entries">
              {section.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="resume-entry"
                    {...(entry.jdComment
                      ? { 'data-jd-anchor': `entry-${entry.id}` }
                      : {})}
                    onMouseEnter={() => setHoveredEntry(entry.id)}
                    onMouseLeave={() => setHoveredEntry(null)}
                  >
                  {editing && hoveredEntry === entry.id && (
                    <button
                      type="button"
                      className="resume-control resume-control--remove-entry"
                      onClick={() => removeEntry(section.id, entry.id)}
                      title="Remove entry"
                    >
                      Delete entry
                    </button>
                  )}

                  <div className="resume-entry-header">
                    <span className="resume-entry-title-line">
                      <EditableText
                        tag="span"
                        className="resume-entry-title"
                        value={entry.title}
                        onChange={(v) =>
                          updateEntry(section.id, entry.id, (e) => ({
                            ...e,
                            title: v,
                          }))
                        }
                        placeholder={section.type === 'experience' ? 'Company' : 'Title'}
                        editing={editing}
                      />
                    </span>
                    {section.type === 'experience' ? (
                      <EditableText
                        tag="span"
                        className="resume-entry-date"
                        value={entry.date}
                        onChange={(v) =>
                          updateEntry(section.id, entry.id, (e) => ({
                            ...e,
                            date: v,
                          }))
                        }
                        placeholder="Date range"
                        editing={editing}
                      />
                    ) : entry.location ? (
                      <EditableText
                        tag="span"
                        className="resume-entry-location"
                        value={entry.location}
                        onChange={(v) =>
                          updateEntry(section.id, entry.id, (e) => ({
                            ...e,
                            location: v,
                          }))
                        }
                        placeholder="Location"
                        editing={editing}
                      />
                    ) : (
                      <EditableText
                        tag="span"
                        className="resume-entry-date"
                        value={entry.date}
                        onChange={(v) =>
                          updateEntry(section.id, entry.id, (e) => ({
                            ...e,
                            date: v,
                          }))
                        }
                        placeholder="Date range"
                        editing={editing}
                      />
                    )}
                  </div>

                  <div className="resume-entry-header resume-entry-header--second">
                    <EditableText
                      tag="span"
                      className="resume-entry-subtitle-text"
                      value={entry.subtitle}
                      onChange={(v) =>
                        updateEntry(section.id, entry.id, (e) => ({
                          ...e,
                          subtitle: v,
                        }))
                      }
                      placeholder={
                        section.type === 'experience'
                          ? 'Job Title | Technologies'
                          : 'Role | Technologies'
                      }
                      editing={editing}
                    />
                    {section.type === 'experience' ? (
                      entry.location ? (
                        <EditableText
                          tag="span"
                          className="resume-entry-location"
                          value={entry.location}
                          onChange={(v) =>
                            updateEntry(section.id, entry.id, (e) => ({
                              ...e,
                              location: v,
                            }))
                          }
                          placeholder="Location"
                          editing={editing}
                        />
                      ) : null
                    ) : entry.location ? (
                      <EditableText
                        tag="span"
                        className="resume-entry-date"
                        value={entry.date}
                        onChange={(v) =>
                          updateEntry(section.id, entry.id, (e) => ({
                            ...e,
                            date: v,
                          }))
                        }
                        placeholder="Date range"
                        editing={editing}
                      />
                    ) : null}
                    {editing && !entry.location && (
                      <button
                        type="button"
                        className="resume-control resume-control--inline resume-control--add-location"
                        onClick={() =>
                          updateEntry(section.id, entry.id, (e) => ({
                            ...e,
                            location: 'City, ST',
                          }))
                        }
                      >
                        + location
                      </button>
                    )}
                  </div>

                  <ul className="resume-bullets">
                    {entry.bullets.map((bullet, idx) => (
                      <li
                        key={idx}
                        className="resume-bullet-item"
                        {...(bullet.jdComment
                          ? {
                              'data-jd-anchor': `bullet-${section.id}-${entry.id}-${idx}`,
                            }
                          : {})}
                      >
                        {editing && (
                          <button
                            type="button"
                            className="resume-control resume-control--remove-bullet"
                            onClick={() =>
                              removeBullet(section.id, entry.id, idx)
                            }
                            title="Remove bullet"
                          >
                            ×
                          </button>
                        )}
                        <EditableText
                          tag="span"
                          className="resume-bullet-text"
                          value={bulletText(bullet)}
                          displayValue={editableValue(
                            bulletText(bullet),
                            effectiveSettings,
                            true,
                          )}
                          onChange={(v) =>
                            updateEntry(section.id, entry.id, (e) => ({
                              ...e,
                              bullets: e.bullets.map((b, i) =>
                                i === idx ? { ...b, text: v } : b,
                              ),
                            }))
                          }
                          placeholder="Bullet point"
                          multiline
                          editing={editing}
                        />
                      </li>
                    ))}
                  </ul>

                  {editing && (
                    <button
                      type="button"
                      className="resume-control resume-control--rail"
                      data-rail="bullet"
                      onClick={() => addBullet(section.id, entry.id)}
                    >
                      + bullet
                    </button>
                  )}
                  </div>
                ))}

              {editing && (
                <button
                  type="button"
                  className="resume-control resume-control--rail"
                  data-rail="entry"
                  onClick={() => addEntry(section.id)}
                >
                  + entry
                </button>
              )}
            </div>
          )}
        </section>
      ))}
      </div>
    </div>
  );
}
