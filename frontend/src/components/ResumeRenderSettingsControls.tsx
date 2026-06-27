import { useEffect, useState } from 'react';
import {
  RESUME_RENDER_TEMPLATES,
  mergeResumeRenderSettings,
  parseCommaList,
  type ResumeRenderSettings,
} from '../utils/resumeSettings';
import './ResumeRenderSettingsControls.css';

const FONT_OPTIONS = [
  'Times New Roman',
  'Georgia',
  'Cambria',
  'Garamond',
  'Arial',
  'Inter',
];

type NumericSettingKey =
  | 'nameFontSize'
  | 'headingFontSize'
  | 'bodyFontSize'
  | 'bulletFontSize'
  | 'lineHeight'
  | 'pagePaddingTop'
  | 'pagePaddingRight'
  | 'pagePaddingBottom'
  | 'pagePaddingLeft'
  | 'sectionSpacing'
  | 'sectionHeaderSpacing'
  | 'entrySpacing'
  | 'textIntensity'
  | 'ruleIntensity'
  | 'bodyTextWeight'
  | 'boldTextWeight'
  | 'strongTextWeight';

type BooleanSettingKey =
  | 'sectionHeadingBold'
  | 'sectionHeadingItalic'
  | 'sectionHeadingUppercase'
  | 'entryTitleBold'
  | 'entryTitleItalic'
  | 'subtitleItalic'
  | 'dateBold'
  | 'dateItalic'
  | 'skillLabelBold';

interface ResumeRenderSettingsControlsProps {
  settings: ResumeRenderSettings;
  onChange: (settings: ResumeRenderSettings) => void;
  tone?: 'dark' | 'light';
  compact?: boolean;
}

const NUMBER_FIELDS: Array<{
  key: NumericSettingKey;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'nameFontSize', label: 'Name size (pt)', min: 16, max: 32, step: 0.5 },
  { key: 'headingFontSize', label: 'Heading size (pt)', min: 8, max: 16, step: 0.5 },
  { key: 'bodyFontSize', label: 'Body size (pt)', min: 8, max: 14, step: 0.25 },
  { key: 'bulletFontSize', label: 'Bullet size (pt)', min: 8, max: 14, step: 0.25 },
  { key: 'lineHeight', label: 'Line height', min: 1, max: 1.6, step: 0.01 },
  { key: 'pagePaddingTop', label: 'Top margin (in)', min: 0.35, max: 0.8, step: 0.01 },
  { key: 'pagePaddingRight', label: 'Right margin (in)', min: 0.4, max: 0.8, step: 0.01 },
  { key: 'pagePaddingBottom', label: 'Bottom margin (in)', min: 0.35, max: 0.8, step: 0.01 },
  { key: 'pagePaddingLeft', label: 'Left margin (in)', min: 0.4, max: 0.8, step: 0.01 },
  { key: 'sectionSpacing', label: 'Before section gap (pt)', min: 3, max: 10, step: 0.5 },
  { key: 'sectionHeaderSpacing', label: 'Title gap (pt)', min: 1, max: 6, step: 0.5 },
  { key: 'entrySpacing', label: 'Entry gap (pt)', min: 1, max: 8, step: 0.5 },
  { key: 'textIntensity', label: 'Text intensity (%)', min: 65, max: 100, step: 1 },
  { key: 'ruleIntensity', label: 'Rule intensity (%)', min: 45, max: 100, step: 1 },
  { key: 'bodyTextWeight', label: 'Body weight (CSS)', min: 300, max: 500, step: 25 },
  { key: 'boldTextWeight', label: 'Bold weight (CSS)', min: 500, max: 800, step: 25 },
  { key: 'strongTextWeight', label: 'Strong weight (CSS)', min: 500, max: 800, step: 25 },
];

const TOGGLE_FIELDS: Array<{ key: BooleanSettingKey; label: string }> = [
  { key: 'sectionHeadingBold', label: 'Heading bold' },
  { key: 'sectionHeadingItalic', label: 'Heading italic' },
  { key: 'sectionHeadingUppercase', label: 'Heading uppercase' },
  { key: 'entryTitleBold', label: 'Entry titles bold' },
  { key: 'entryTitleItalic', label: 'Entry titles italic' },
  { key: 'subtitleItalic', label: 'Subtitles italic' },
  { key: 'dateBold', label: 'Dates bold' },
  { key: 'dateItalic', label: 'Dates italic' },
  { key: 'skillLabelBold', label: 'Skill labels bold' },
];

function numericDraftsFromSettings(settings: ResumeRenderSettings) {
  return Object.fromEntries(
    NUMBER_FIELDS.map((field) => [field.key, String(settings[field.key])]),
  ) as Record<NumericSettingKey, string>;
}

export function ResumeRenderSettingsControls({
  settings,
  onChange,
  tone = 'dark',
  compact = false,
}: ResumeRenderSettingsControlsProps) {
  const [numericDrafts, setNumericDrafts] = useState(() =>
    numericDraftsFromSettings(settings),
  );
  const [focusedNumberField, setFocusedNumberField] =
    useState<NumericSettingKey | null>(null);

  useEffect(() => {
    const nextDrafts = numericDraftsFromSettings(settings);
    setNumericDrafts((current) => {
      if (!focusedNumberField) {
        return nextDrafts;
      }

      return {
        ...nextDrafts,
        [focusedNumberField]: current[focusedNumberField],
      };
    });
  }, [focusedNumberField, settings]);

  const update = (patch: Partial<ResumeRenderSettings>) => {
    onChange(mergeResumeRenderSettings({ ...settings, ...patch }));
  };

  const updateNumberDraft = (
    field: NumericSettingKey,
    rawValue: string,
    min: number,
    max: number,
  ) => {
    setNumericDrafts((current) => ({
      ...current,
      [field]: rawValue,
    }));

    if (!rawValue.trim()) {
      return;
    }

    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) {
      return;
    }
    if (numericValue < min || numericValue > max) {
      return;
    }

    update({ [field]: numericValue });
  };

  const syncNumberDraft = (field: NumericSettingKey) => {
    setFocusedNumberField(null);
    setNumericDrafts((current) => ({
      ...current,
      [field]: String(settings[field]),
    }));
  };

  return (
    <div
      className={`resume-settings-controls resume-settings-controls--${tone}${compact ? ' resume-settings-controls--compact' : ''}`}
    >
      <section className="resume-settings-controls__group resume-settings-controls__group--template">
        <span className="resume-settings-controls__label">Template</span>
        <div className="resume-settings-controls__template-row">
          {RESUME_RENDER_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              className={`resume-settings-controls__template${settings.defaultTemplate === template.id ? ' resume-settings-controls__template--active' : ''}`}
              onClick={() => update({ defaultTemplate: template.id })}
              title={template.summary}
            >
              {template.name}
            </button>
          ))}
        </div>
      </section>

      <section className="resume-settings-controls__group resume-settings-controls__group--fonts resume-settings-controls__grid">
        <label className="resume-settings-controls__field">
          <span>Body font</span>
          <select
            value={settings.bodyFontFamily}
            onChange={(event) => update({ bodyFontFamily: event.target.value })}
          >
            {FONT_OPTIONS.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </label>
        <label className="resume-settings-controls__field">
          <span>Name font</span>
          <select
            value={settings.nameFontFamily}
            onChange={(event) => update({ nameFontFamily: event.target.value })}
          >
            {FONT_OPTIONS.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </label>
        <label className="resume-settings-controls__field">
          <span>Heading font</span>
          <select
            value={settings.headingFontFamily}
            onChange={(event) => update({ headingFontFamily: event.target.value })}
          >
            {FONT_OPTIONS.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </label>
        <label className="resume-settings-controls__field resume-settings-controls__field--wide">
          <span>Keyword terms</span>
          <input
            value={settings.keywordTerms.join(', ')}
            onChange={(event) => update({ keywordTerms: parseCommaList(event.target.value) })}
          />
        </label>
      </section>

      <section className="resume-settings-controls__group resume-settings-controls__group--numbers resume-settings-controls__grid">
        {NUMBER_FIELDS.map((field) => (
          <label key={field.key} className="resume-settings-controls__field">
            <span>{field.label}</span>
            <input
              type="number"
              min={field.min}
              max={field.max}
              step={field.step}
              value={numericDrafts[field.key]}
              onFocus={() => setFocusedNumberField(field.key)}
              onChange={(event) =>
                updateNumberDraft(
                  field.key,
                  event.target.value,
                  field.min,
                  field.max,
                )
              }
              onBlur={() => syncNumberDraft(field.key)}
            />
          </label>
        ))}
      </section>

      <section className="resume-settings-controls__group resume-settings-controls__group--toggles resume-settings-controls__toggles">
        <span className="resume-settings-controls__label">Text style</span>
        {TOGGLE_FIELDS.map((field) => (
          <label key={field.key}>
            <input
              type="checkbox"
              checked={settings[field.key]}
              onChange={(event) => update({ [field.key]: event.target.checked })}
            />
            <span>{field.label}</span>
          </label>
        ))}
      </section>
    </div>
  );
}
