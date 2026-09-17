import { type CSSProperties, useCallback, useMemo, useState } from 'react';
import type {
  ContactLink,
  ResumeData,
  ResumeEntry,
  ResumeSection,
  EntryLink,
  SectionType,
} from '../types/resume';
import { bulletText, makeBullet } from '../types/resume';
import {
  mergeResumeRenderSettings,
  type ResumeRenderSettings,
} from '../utils/resumeSettings';
import { normalizeUrl } from '../utils/resumeLinks';
import { orderSectionsForDisplay } from '../utils/sectionOrder';
import { ContactLinkText } from './ContactLinkText';
import { EditableText } from './EditableText';
import './ResumeDocument.css';

interface ResumeDocumentProps {
  data: ResumeData;
  onChange: (data: ResumeData, immediateHistory?: boolean) => void;
  editing?: boolean;
  id?: string;
  settings?: ResumeRenderSettings;
}

/** House style: internships, startups, and projects never show a location. */
const NO_LOCATION_SECTIONS: SectionType[] = ['experience', 'projects'];

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function cssFontFamily(name: string) {
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

function grayscaleFromIntensity(intensity: number) {
  const channel = Math.round(255 * (1 - intensity / 100));
  return `rgb(${channel}, ${channel}, ${channel})`;
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
    (linkId: string, patch: Partial<ContactLink>) => {
      emitChange({
        ...data,
        contact: {
          ...data.contact,
          links: data.contact.links.map((link) =>
            link.id === linkId ? { ...link, ...patch } : link,
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
            { id: generateId(), value: 'github.com/username', label: 'GitHub' },
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
            location: NO_LOCATION_SECTIONS.includes(section.type) ? '' : 'City, ST',
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
        className={`resume-page resume-page--${effectiveSettings.defaultTemplate}${editing ? '' : ' resume-page--print'}${effectiveSettings.showHeader ? '' : ' resume-page--no-header'}`}
        id={id}
        style={pageStyle}
      >
      {effectiveSettings.showHeader && (
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
              <ContactLinkText
                link={link}
                editing={editing}
                onChange={(patch) => updateContactLink(link.id, patch)}
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
      )}

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
                      {(entry.titleNote || editing) && section.type !== 'skills' && (
                        <span className="resume-entry-title-note-item">
                          {entry.titleNote && (
                            <span className="resume-entry-link-sep" aria-hidden>
                              {' | '}
                            </span>
                          )}
                          <EditableText
                            tag="span"
                            className="resume-entry-title-note"
                            value={entry.titleNote ?? ''}
                            onChange={(v) =>
                              updateEntry(section.id, entry.id, (e) => ({
                                ...e,
                                titleNote: v,
                              }))
                            }
                            placeholder={editing && !entry.titleNote ? '+ note' : ''}
                            editing={editing}
                          />
                        </span>
                      )}
                      {(entry.links ?? []).map((link, linkIndex) => {
                        const href = normalizeUrl(link.url);
                        const setLink = (patch: Partial<EntryLink>, snapshot = false) =>
                          updateEntry(
                            section.id,
                            entry.id,
                            (e) => ({
                              ...e,
                              links: (e.links ?? []).map((l, i) =>
                                i === linkIndex ? { ...l, ...patch } : l,
                              ),
                            }),
                            snapshot,
                          );
                        const labelText = (
                          <EditableText
                            tag="span"
                            className="resume-entry-link-label"
                            value={link.label}
                            onChange={(v) => setLink({ label: v })}
                            placeholder="Link label"
                            editing={editing}
                          />
                        );
                        return (
                          <span key={linkIndex} className="resume-entry-link-item">
                            <span className="resume-entry-link-sep" aria-hidden>
                              {' | '}
                            </span>
                            {href ? (
                              <a
                                className="resume-link resume-entry-title-link"
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => {
                                  if (editing) e.preventDefault();
                                }}
                              >
                                {labelText}
                              </a>
                            ) : (
                              labelText
                            )}
                            {editing && (
                              <span className="resume-control resume-control--url-chip">
                                🔗
                                <EditableText
                                  tag="span"
                                  className="resume-entry-url"
                                  value={link.url}
                                  onChange={(v) => setLink({ url: v })}
                                  placeholder="https://github.com/user/repo"
                                  editing
                                />
                                <button
                                  type="button"
                                  className="resume-control resume-control--remove"
                                  onClick={() =>
                                    updateEntry(
                                      section.id,
                                      entry.id,
                                      (e) => {
                                        const links = (e.links ?? []).filter((_, i) => i !== linkIndex);
                                        return links.length > 0
                                          ? { ...e, links }
                                          : { ...e, links: undefined };
                                      },
                                      true,
                                    )
                                  }
                                  title="Remove hyperlink"
                                >
                                  ×
                                </button>
                              </span>
                            )}
                          </span>
                        );
                      })}
                      {editing && (
                        <button
                          type="button"
                          className="resume-control resume-control--inline resume-control--add-url"
                          onClick={() =>
                            updateEntry(section.id, entry.id, (e) => ({
                              ...e,
                              links: [
                                ...(e.links ?? []),
                                {
                                  label: (e.links ?? []).length === 0 ? 'GitHub' : 'Website',
                                  url: '',
                                },
                              ],
                            }))
                          }
                          title="Add a hyperlink after this entry's title (GitHub, live site…)"
                        >
                          + link
                        </button>
                      )}
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
                    {editing && !entry.location && !NO_LOCATION_SECTIONS.includes(section.type) && (
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
