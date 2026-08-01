import { useState } from 'react';
import { GripVertical, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { Stepper } from '../components/Stepper';
import type { ResumeData } from '../types/resume';
import { makeBullet } from '../types/resume';
import {
  DEFAULT_RESUME_RENDER_SETTINGS,
  RESUME_RENDER_TEMPLATES,
  loadResumeRenderSettings,
  mergeResumeRenderSettings,
  parseCommaList,
  saveResumeRenderSettings,
  type ResumeRenderSettings,
} from '../utils/resumeSettings';
import { ResumeDocument } from '../components/ResumeDocument';
import './SettingsPage.css';

const FONT_OPTIONS = [
  'Times New Roman',
  'Georgia',
  'Cambria',
  'Garamond',
  'Arial',
  'Inter',
];

const SETTINGS_PREVIEW_RESUME: ResumeData = {
  contact: {
    name: 'Sample Candidate',
    links: [
      { id: 'preview-email', value: 'candidate@email.com' },
      { id: 'preview-linkedin', value: 'linkedin.com/in/candidate' },
      { id: 'preview-location', value: 'Houston, TX' },
    ],
  },
  sections: [
    {
      id: 'preview-education',
      type: 'education',
      title: 'Education',
      entries: [
        {
          id: 'preview-edu-1',
          title: 'Rice University',
          location: 'Houston, TX',
          date: 'Aug 2025 - May 2029',
          subtitle: 'B.S. in Computer Science and Mathematics',
          bullets: [
            makeBullet('GPA: 4.0/4.0; Relevant Coursework: Algorithms, Data Science, Linear Algebra.'),
          ],
        },
      ],
    },
    {
      id: 'preview-experience',
      type: 'experience',
      title: 'Experience',
      entries: [
        {
          id: 'preview-exp-1',
          title: 'Product Engineering Intern',
          location: 'Remote',
          date: 'May 2026 - Aug 2026',
          subtitle: 'React, TypeScript, FastAPI, PostgreSQL',
          bullets: [
            makeBullet(
              'Built workflow tooling that reduced review latency by 35% across production dashboards.',
            ),
            makeBullet(
              'Improved data validation and API error handling for 10k+ monthly user actions.',
            ),
          ],
        },
      ],
    },
    {
      id: 'preview-projects',
      type: 'projects',
      title: 'Projects',
      entries: [
        {
          id: 'preview-project-1',
          title: 'Resume Builder',
          location: '',
          date: '2026',
          subtitle: 'React, Chrome Extension, PDF Export',
          bullets: [
            makeBullet(
              'Created a local-first resume editor with AI-assisted generation and selectable text PDF export.',
            ),
          ],
        },
      ],
    },
    {
      id: 'preview-skills',
      type: 'skills',
      title: 'Technical Skills',
      entries: [],
      skills: [
        {
          id: 'preview-skills-1',
          label: 'Languages',
          items: 'Python, TypeScript, SQL, Java',
        },
        {
          id: 'preview-skills-2',
          label: 'Tools',
          items: 'React, FastAPI, PostgreSQL, Docker, AWS',
        },
      ],
    },
  ],
};

function SettingToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="settings-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function updateSetting(
  settings: ResumeRenderSettings,
  patch: Partial<ResumeRenderSettings>,
) {
  return mergeResumeRenderSettings({ ...settings, ...patch });
}

function bulletDraftsFromSettings(settings: ResumeRenderSettings) {
  return {
    min: String(settings.minBulletsPerExperience),
    max: String(settings.maxBulletsPerExperience),
  };
}

type NumericSettingKey =
  | 'nameFontSize'
  | 'headingFontSize'
  | 'bodyFontSize'
  | 'bulletFontSize'
  | 'bodyTextWeight'
  | 'boldTextWeight'
  | 'strongTextWeight'
  | 'textIntensity'
  | 'ruleIntensity'
  | 'lineHeight'
  | 'pagePaddingLeft'
  | 'pagePaddingRight'
  | 'pagePaddingTop'
  | 'pagePaddingBottom'
  | 'sectionSpacing'
  | 'sectionHeaderSpacing'
  | 'entrySpacing';

function numericDraftsFromSettings(settings: ResumeRenderSettings) {
  return {
    nameFontSize: String(settings.nameFontSize),
    headingFontSize: String(settings.headingFontSize),
    bodyFontSize: String(settings.bodyFontSize),
    bulletFontSize: String(settings.bulletFontSize),
    bodyTextWeight: String(settings.bodyTextWeight),
    boldTextWeight: String(settings.boldTextWeight),
    strongTextWeight: String(settings.strongTextWeight),
    textIntensity: String(settings.textIntensity),
    ruleIntensity: String(settings.ruleIntensity),
    lineHeight: String(settings.lineHeight),
    pagePaddingLeft: String(settings.pagePaddingLeft),
    pagePaddingRight: String(settings.pagePaddingRight),
    pagePaddingTop: String(settings.pagePaddingTop),
    pagePaddingBottom: String(settings.pagePaddingBottom),
    sectionSpacing: String(settings.sectionSpacing),
    sectionHeaderSpacing: String(settings.sectionHeaderSpacing),
    entrySpacing: String(settings.entrySpacing),
  } satisfies Record<NumericSettingKey, string>;
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function SettingsPage() {
  const [draggedSectionIndex, setDraggedSectionIndex] = useState<number | null>(null);
  const [{ settings }, setPageState] = useState(() => {
    const initialSettings = loadResumeRenderSettings();
    return {
      settings: initialSettings,
      bulletDrafts: bulletDraftsFromSettings(initialSettings),
      numericDrafts: numericDraftsFromSettings(initialSettings),
    };
  });

  function setSettings(
    next: ResumeRenderSettings,
    syncBulletDrafts = false,
    syncNumericDrafts = false,
  ) {
    setPageState((current) => ({
      settings: next,
      bulletDrafts: syncBulletDrafts
        ? bulletDraftsFromSettings(next)
        : current.bulletDrafts,
      numericDrafts: syncNumericDrafts
        ? numericDraftsFromSettings(next)
        : current.numericDrafts,
    }));
    saveResumeRenderSettings(next);
  }

  function updateBulletSetting(
    field: 'minBulletsPerExperience' | 'maxBulletsPerExperience',
    rawValue: string,
  ) {
    setPageState((current) => ({
      ...current,
      bulletDrafts: {
        ...current.bulletDrafts,
        [field === 'minBulletsPerExperience' ? 'min' : 'max']: rawValue,
      },
    }));

    if (!rawValue.trim()) {
      return;
    }

    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    const patch: Partial<ResumeRenderSettings> = {};
    if (field === 'minBulletsPerExperience') {
      const minBullets = clampInteger(numericValue, 1, 5);
      patch.minBulletsPerExperience = minBullets;
      if (settings.maxBulletsPerExperience < minBullets) {
        patch.maxBulletsPerExperience = minBullets;
      }
    } else {
      const maxBullets = clampInteger(numericValue, 1, 6);
      patch.maxBulletsPerExperience = maxBullets;
      if (settings.minBulletsPerExperience > maxBullets) {
        patch.minBulletsPerExperience = maxBullets;
      }
    }

    const next = updateSetting(settings, patch);
    setPageState((current) => ({
      settings: next,
      bulletDrafts: {
        min:
          field === 'minBulletsPerExperience'
            ? rawValue
            : String(next.minBulletsPerExperience),
        max:
          field === 'maxBulletsPerExperience'
            ? rawValue
            : String(next.maxBulletsPerExperience),
      },
      numericDrafts: current.numericDrafts,
    }));
    saveResumeRenderSettings(next);
  }

  function updateNumericSetting(field: NumericSettingKey, rawValue: string) {
    setPageState((current) => ({
      ...current,
      numericDrafts: {
        ...current.numericDrafts,
        [field]: rawValue,
      },
    }));

    if (!rawValue.trim()) {
      return;
    }

    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    const next = updateSetting(settings, {
      [field]: numericValue,
    } as Partial<ResumeRenderSettings>);
    setPageState((current) => ({
      settings: next,
      bulletDrafts: current.bulletDrafts,
      numericDrafts: {
        ...current.numericDrafts,
        [field]: rawValue,
      },
    }));
    saveResumeRenderSettings(next);
  }

  function updateSectionHeadings(sectionHeadings: string[]) {
    setSettings(updateSetting(settings, { sectionHeadings }));
  }

  function moveSectionHeading(fromIndex: number, toIndex: number) {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= settings.sectionHeadings.length ||
      toIndex >= settings.sectionHeadings.length
    ) {
      return;
    }

    const nextHeadings = [...settings.sectionHeadings];
    const [heading] = nextHeadings.splice(fromIndex, 1);
    nextHeadings.splice(toIndex, 0, heading);
    updateSectionHeadings(nextHeadings);
  }

  /** Decimals implied by the step, so 0.25 shows "10.25" and 25 shows "650". */
  function formatSettingValue(value: number, step: number) {
    if (step >= 1) return String(Math.round(value));
    // Only show decimals when the value actually has them: "11", not "11.0".
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(step >= 0.1 ? 1 : 2);
  }

  /**
   * Slider rather than a number box, matching the editor's Style drawer. These
   * are bounded continuous quantities, and a bare box showed neither the legal
   * range nor where in it the current value sat.
   */
  function renderNumberField({
    label,
    field,
    min,
    max,
    step,
  }: {
    label: string;
    field: NumericSettingKey;
    min: number;
    max: number;
    step: number;
  }) {
    return (
      <div className="field settings-slider-field">
        <span>
          {label}
          <output className="settings-slider-value">
            {formatSettingValue(settings[field], step)}
          </output>
        </span>
        <div className="settings-slider-row">
          <span className="settings-slider-bound" aria-hidden>
            {formatSettingValue(min, step)}
          </span>
          <input
            className="settings-slider"
            type="range"
            min={min}
            max={max}
            step={step}
            value={settings[field]}
            aria-label={label}
            onChange={(event) => updateNumericSetting(field, event.target.value)}
          />
          <span className="settings-slider-bound" aria-hidden>
            {formatSettingValue(max, step)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="page settings-page">
      <header className="page-header settings-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">
            Defaults for resume generation and final rendering. You can override these in
            the builder for one-off cases.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => setSettings(DEFAULT_RESUME_RENDER_SETTINGS, true, true)}
        >
          <RotateCcw size={14} />
          Reset
        </button>
      </header>

      <section className="card settings-card">
        <h2>
          <SlidersHorizontal size={16} />
          Resume formats
        </h2>
        <div className="settings-template-grid">
          {RESUME_RENDER_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              className={`settings-template${settings.defaultTemplate === template.id ? ' settings-template--active' : ''}`}
              onClick={() =>
                setSettings(updateSetting(settings, { defaultTemplate: template.id }))
              }
            >
              <strong>{template.name}</strong>
              <span>{template.summary}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card settings-card">
        <h2>Content Defaults</h2>
        <div className="settings-grid">
          <div className="field settings-section-order">
            <span>Section order</span>
            <div className="settings-section-order-list">
              {settings.sectionHeadings.map((heading, index) => (
                <div
                  key={`${heading}-${index}`}
                  className={`settings-section-order-row${draggedSectionIndex === index ? ' settings-section-order-row--dragging' : ''}`}
                  draggable
                  onDragStart={(event) => {
                    setDraggedSectionIndex(index);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', String(index));
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const fromIndex = Number(event.dataTransfer.getData('text/plain'));
                    if (Number.isInteger(fromIndex)) {
                      moveSectionHeading(fromIndex, index);
                    }
                    setDraggedSectionIndex(null);
                  }}
                  onDragEnd={() => setDraggedSectionIndex(null)}
                >
                  <GripVertical className="settings-section-order-grip" size={16} />
                  <span>{heading}</span>
                </div>
              ))}
            </div>
            <input
              aria-label="Section headings in display order"
              value={settings.sectionHeadings.join(', ')}
              onChange={(event) => updateSectionHeadings(parseCommaList(event.target.value))}
            />
          </div>
          <div className="field">
            <span>Min bullets per experience</span>
            <Stepper
              label="Min bullets per experience"
              value={settings.minBulletsPerExperience}
              min={1}
              max={5}
              onChange={(next) =>
                updateBulletSetting('minBulletsPerExperience', String(next))
              }
            />
          </div>
          <div className="field">
            <span>Max bullets per experience</span>
            <Stepper
              label="Max bullets per experience"
              value={settings.maxBulletsPerExperience}
              min={1}
              max={6}
              onChange={(next) =>
                updateBulletSetting('maxBulletsPerExperience', String(next))
              }
            />
          </div>
        </div>
        <label className="field settings-notes">
          <span>Special resume generation notes</span>
          <textarea
            value={settings.specialInstructions}
            onChange={(event) =>
              setSettings(
                updateSetting(settings, {
                  specialInstructions: event.target.value,
                }),
              )
            }
            rows={6}
          />
        </label>
      </section>

      <section className="card settings-card">
        <h2>Style Controls</h2>
        <div className="settings-toggle-group">
          <h3>Section headings</h3>
          <div className="settings-toggle-grid">
            <SettingToggle
              label="Bold"
              checked={settings.sectionHeadingBold}
              onChange={(checked) =>
                setSettings(updateSetting(settings, { sectionHeadingBold: checked }))
              }
            />
            <SettingToggle
              label="Italic"
              checked={settings.sectionHeadingItalic}
              onChange={(checked) =>
                setSettings(updateSetting(settings, { sectionHeadingItalic: checked }))
              }
            />
            <SettingToggle
              label="Uppercase"
              checked={settings.sectionHeadingUppercase}
              onChange={(checked) =>
                setSettings(updateSetting(settings, { sectionHeadingUppercase: checked }))
              }
            />
          </div>
        </div>

        <div className="settings-toggle-group">
          <h3>Entry titles</h3>
          <div className="settings-toggle-grid">
            <SettingToggle
              label="Bold"
              checked={settings.entryTitleBold}
              onChange={(checked) =>
                setSettings(updateSetting(settings, { entryTitleBold: checked }))
              }
            />
            <SettingToggle
              label="Italic"
              checked={settings.entryTitleItalic}
              onChange={(checked) =>
                setSettings(updateSetting(settings, { entryTitleItalic: checked }))
              }
            />
          </div>
        </div>

        <div className="settings-toggle-group">
          <h3>Subtitles and dates</h3>
          <div className="settings-toggle-grid">
            <SettingToggle
              label="Subtitles italic"
              checked={settings.subtitleItalic}
              onChange={(checked) =>
                setSettings(updateSetting(settings, { subtitleItalic: checked }))
              }
            />
            <SettingToggle
              label="Dates bold"
              checked={settings.dateBold}
              onChange={(checked) =>
                setSettings(updateSetting(settings, { dateBold: checked }))
              }
            />
            <SettingToggle
              label="Dates italic"
              checked={settings.dateItalic}
              onChange={(checked) =>
                setSettings(updateSetting(settings, { dateItalic: checked }))
              }
            />
          </div>
        </div>

        <div className="settings-toggle-group">
          <h3>Skills</h3>
          <div className="settings-toggle-grid">
            <SettingToggle
              label="Skill labels bold"
              checked={settings.skillLabelBold}
              onChange={(checked) =>
                setSettings(updateSetting(settings, { skillLabelBold: checked }))
              }
            />
          </div>
        </div>
      </section>

      <section className="card settings-card">
        <h2>Type Settings</h2>
        <div className="settings-preview">
          <div className="settings-preview-toolbar">
            <span>Live preview</span>
            <div className="settings-preview-metrics" aria-label="Current page measurements">
              <span>T {settings.pagePaddingTop}in</span>
              <span>R {settings.pagePaddingRight}in</span>
              <span>B {settings.pagePaddingBottom}in</span>
              <span>L {settings.pagePaddingLeft}in</span>
              <span>{settings.bodyFontSize}pt</span>
              <span>{settings.lineHeight}x</span>
              <span>Ink {settings.textIntensity}%</span>
              <span>Rule {settings.ruleIntensity}%</span>
              <span>Bold {settings.boldTextWeight}</span>
            </div>
          </div>
          <div className="settings-preview-frame">
            <div className="settings-preview-scale">
              <ResumeDocument
                data={SETTINGS_PREVIEW_RESUME}
                onChange={() => {}}
                editing={false}
                id="settings-preview-resume"
                settings={settings}
              />
            </div>
          </div>
        </div>
        <div className="settings-grid">
          <label className="field">
            <span>Body font</span>
            <select
              value={settings.bodyFontFamily}
              onChange={(event) =>
                setSettings(
                  updateSetting(settings, {
                    bodyFontFamily: event.target.value,
                  }),
                )
              }
            >
              {FONT_OPTIONS.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Name font</span>
            <select
              value={settings.nameFontFamily}
              onChange={(event) =>
                setSettings(
                  updateSetting(settings, {
                    nameFontFamily: event.target.value,
                  }),
                )
              }
            >
              {FONT_OPTIONS.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Section heading font</span>
            <select
              value={settings.headingFontFamily}
              onChange={(event) =>
                setSettings(
                  updateSetting(settings, {
                    headingFontFamily: event.target.value,
                  }),
                )
              }
            >
              {FONT_OPTIONS.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </label>
          {renderNumberField({
            label: 'Name size (pt)',
            field: 'nameFontSize',
            min: 16,
            max: 32,
            step: 0.5,
          })}
          {renderNumberField({
            label: 'Heading size (pt)',
            field: 'headingFontSize',
            min: 8,
            max: 16,
            step: 0.5,
          })}
          {renderNumberField({
            label: 'Body size (pt)',
            field: 'bodyFontSize',
            min: 8,
            max: 14,
            step: 0.25,
          })}
          {renderNumberField({
            label: 'Bullet size (pt)',
            field: 'bulletFontSize',
            min: 8,
            max: 14,
            step: 0.25,
          })}
          {renderNumberField({
            label: 'Text intensity (%)',
            field: 'textIntensity',
            min: 65,
            max: 100,
            step: 1,
          })}
          {renderNumberField({
            label: 'Rule intensity (%)',
            field: 'ruleIntensity',
            min: 45,
            max: 100,
            step: 1,
          })}
          {renderNumberField({
            label: 'Body weight (CSS)',
            field: 'bodyTextWeight',
            min: 300,
            max: 500,
            step: 25,
          })}
          {renderNumberField({
            label: 'Bold weight (CSS)',
            field: 'boldTextWeight',
            min: 500,
            max: 800,
            step: 25,
          })}
          {renderNumberField({
            label: 'Strong keyword weight (CSS)',
            field: 'strongTextWeight',
            min: 500,
            max: 800,
            step: 25,
          })}
          {renderNumberField({
            label: 'Line height (x)',
            field: 'lineHeight',
            min: 1,
            max: 1.6,
            step: 0.01,
          })}
          {renderNumberField({
            label: 'Left margin (in)',
            field: 'pagePaddingLeft',
            min: 0.4,
            max: 0.8,
            step: 0.01,
          })}
          {renderNumberField({
            label: 'Right margin (in)',
            field: 'pagePaddingRight',
            min: 0.4,
            max: 0.8,
            step: 0.01,
          })}
          {renderNumberField({
            label: 'Top margin (in)',
            field: 'pagePaddingTop',
            min: 0.35,
            max: 0.8,
            step: 0.01,
          })}
          {renderNumberField({
            label: 'Bottom margin (in)',
            field: 'pagePaddingBottom',
            min: 0.35,
            max: 0.8,
            step: 0.01,
          })}
          {renderNumberField({
            label: 'Before section gap (pt)',
            field: 'sectionSpacing',
            min: 3,
            max: 10,
            step: 0.5,
          })}
          {renderNumberField({
            label: 'Title-to-content gap (pt)',
            field: 'sectionHeaderSpacing',
            min: 1,
            max: 6,
            step: 0.5,
          })}
          {renderNumberField({
            label: 'Entry spacing (pt)',
            field: 'entrySpacing',
            min: 1,
            max: 8,
            step: 0.5,
          })}
        </div>
      </section>

    </div>
  );
}

