import { useId, useState } from 'react';
import { GripVertical } from 'lucide-react';
import {
  RESUME_RENDER_TEMPLATES,
  mergeResumeRenderSettings,
  parseCommaList,
  type ResumeRenderSettings,
} from '../utils/resumeSettings';
import './ResumeRenderSettingsControls.css';

function InfoDot({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  return (
    <button
      type="button"
      className="info-dot"
      aria-label={`Info: ${text}`}
      aria-describedby={open ? tipId : undefined}
      onClick={() => setOpen((value) => !value)}
      onBlur={() => setOpen(false)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      i
      {open ? (
        <span className="info-dot__tip" id={tipId} role="tooltip">
          {text}
        </span>
      ) : null}
    </button>
  );
}

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
  | 'bulletIndent'
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
  help: string;
}> = [
  { key: 'nameFontSize', label: 'Name size (pt)', min: 16, max: 32, step: 0.5, help: 'How big your name looks at the very top.' },
  { key: 'headingFontSize', label: 'Heading size (pt)', min: 8, max: 16, step: 0.5, help: 'How big section titles like "Experience" are.' },
  { key: 'bodyFontSize', label: 'Body size (pt)', min: 8, max: 14, step: 0.25, help: 'How big the main text is.' },
  { key: 'bulletFontSize', label: 'Bullet size (pt)', min: 8, max: 14, step: 0.25, help: 'How big the text inside each bullet point is.' },
  { key: 'bulletIndent', label: 'Bullet indent (pt)', min: 5, max: 16, step: 0.5, help: 'Space from the bullet marker to the start of the bullet text.' },
  { key: 'lineHeight', label: 'Line height', min: 1, max: 1.6, step: 0.01, help: 'Space between lines of text. Bigger means more breathing room.' },
  { key: 'pagePaddingTop', label: 'Top margin (in)', min: 0.35, max: 0.8, step: 0.01, help: 'Empty space above the resume content.' },
  { key: 'pagePaddingRight', label: 'Right margin (in)', min: 0.4, max: 0.8, step: 0.01, help: 'Empty space on the right side of the page.' },
  { key: 'pagePaddingBottom', label: 'Bottom margin (in)', min: 0.35, max: 0.8, step: 0.01, help: 'Empty space below the resume content.' },
  { key: 'pagePaddingLeft', label: 'Left margin (in)', min: 0.4, max: 0.8, step: 0.01, help: 'Empty space on the left side of the page.' },
  { key: 'sectionSpacing', label: 'Before section gap (pt)', min: 3, max: 10, step: 0.5, help: 'Space above each section title.' },
  { key: 'sectionHeaderSpacing', label: 'Title gap (pt)', min: 1, max: 6, step: 0.5, help: 'Space between a section title and the content under it.' },
  { key: 'entrySpacing', label: 'Entry gap (pt)', min: 1, max: 8, step: 0.5, help: 'Space between two entries, like two jobs.' },
  { key: 'textIntensity', label: 'Text intensity (%)', min: 65, max: 100, step: 1, help: 'How dark the text is. 100 is pure black; lower is lighter gray.' },
  { key: 'ruleIntensity', label: 'Rule intensity (%)', min: 45, max: 100, step: 1, help: 'How dark the horizontal lines under section titles are.' },
  { key: 'bodyTextWeight', label: 'Body weight (CSS)', min: 300, max: 500, step: 25, help: 'Thickness of normal text. Most fonts only have normal and bold, so this may look unchanged.' },
  { key: 'boldTextWeight', label: 'Bold weight (CSS)', min: 500, max: 800, step: 25, help: 'Thickness of bold structure: headings, titles, dates, and skill labels.' },
  { key: 'strongTextWeight', label: 'Strong weight (CSS)', min: 500, max: 800, step: 25, help: 'Thickness of bold words inside bullets, like a bolded number or keyword.' },
];

const TOGGLE_FIELDS: Array<{ key: BooleanSettingKey; label: string; help: string }> = [
  { key: 'sectionHeadingBold', label: 'Heading bold', help: 'Makes section titles bold.' },
  { key: 'sectionHeadingItalic', label: 'Heading italic', help: 'Makes section titles slanted (italic).' },
  { key: 'sectionHeadingUppercase', label: 'Heading uppercase', help: 'Makes section titles ALL CAPS.' },
  { key: 'entryTitleBold', label: 'Entry titles bold', help: 'Makes job or entry titles bold.' },
  { key: 'entryTitleItalic', label: 'Entry titles italic', help: 'Makes job or entry titles slanted (italic).' },
  { key: 'subtitleItalic', label: 'Subtitles italic', help: 'Makes the role/tech line under a title slanted.' },
  { key: 'dateBold', label: 'Dates bold', help: 'Makes date ranges bold.' },
  { key: 'dateItalic', label: 'Dates italic', help: 'Makes date ranges slanted (italic).' },
  { key: 'skillLabelBold', label: 'Skill labels bold', help: 'Makes skill category labels like "Languages:" bold.' },
];

export function ResumeRenderSettingsControls({
  settings,
  onChange,
  tone = 'dark',
  compact = false,
}: ResumeRenderSettingsControlsProps) {
  const [numericDrafts, setNumericDrafts] = useState<
    Partial<Record<NumericSettingKey, string>>
  >({});
  const [focusedNumberField, setFocusedNumberField] =
    useState<NumericSettingKey | null>(null);
  const [draggedSectionIndex, setDraggedSectionIndex] = useState<number | null>(null);

  const update = (patch: Partial<ResumeRenderSettings>) => {
    onChange(mergeResumeRenderSettings({ ...settings, ...patch }));
  };

  const moveSectionHeading = (fromIndex: number, toIndex: number) => {
    const headings = settings.sectionHeadings;
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= headings.length ||
      toIndex >= headings.length
    ) {
      return;
    }
    const next = [...headings];
    const [heading] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, heading);
    update({ sectionHeadings: next });
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
    setNumericDrafts((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  return (
    <div
      className={`resume-settings-controls resume-settings-controls--${tone}${compact ? ' resume-settings-controls--compact' : ''}`}
    >
      <section className="resume-settings-controls__group resume-settings-controls__group--template">
        <span className="resume-settings-controls__label">
          Template
          <InfoDot text="The overall look. Classic is a clean plain resume. Keyword emphasis bolds important keywords inside bullets." />
        </span>
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

      <section className="resume-settings-controls__group resume-settings-controls__group--section-order">
        <span className="resume-settings-controls__label">
          Section order
          <InfoDot text="Drag rows or use ↑ ↓ to reorder sections on the resume. Edit the text field to rename or add sections." />
        </span>
        <div className="rsc-section-order-list">
          {settings.sectionHeadings.map((heading, index) => (
            <div
              key={`${heading}-${index}`}
              className={`rsc-section-order-row${draggedSectionIndex === index ? ' rsc-section-order-row--dragging' : ''}`}
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
              <GripVertical className="rsc-section-order-grip" size={14} />
              <span>{heading}</span>
              <div className="rsc-section-order-actions">
                <button
                  type="button"
                  className="rsc-section-order-btn"
                  onClick={() => moveSectionHeading(index, index - 1)}
                  disabled={index === 0}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="rsc-section-order-btn"
                  onClick={() => moveSectionHeading(index, index + 1)}
                  disabled={index === settings.sectionHeadings.length - 1}
                  title="Move down"
                >
                  ↓
                </button>
              </div>
            </div>
          ))}
        </div>
        <input
          className="rsc-section-order-input"
          aria-label="Section headings in display order (comma-separated)"
          value={settings.sectionHeadings.join(', ')}
          onChange={(event) => update({ sectionHeadings: parseCommaList(event.target.value) })}
          placeholder="e.g. Education, Experience, Projects"
        />
      </section>

      <section className="resume-settings-controls__group resume-settings-controls__group--fonts resume-settings-controls__grid">
        <label className="resume-settings-controls__field">
          <span>Body font <InfoDot text="Font used for the main text in bullets and skills." /></span>
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
          <span>Name font <InfoDot text="Font used for your name at the top." /></span>
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
          <span>Heading font <InfoDot text="Font used for section titles like Experience and Education." /></span>
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
          <span>Keyword terms <InfoDot text="Words that get automatically bolded inside bullets. Only used in the Keyword emphasis template." /></span>
          <input
            value={settings.keywordTerms.join(', ')}
            onChange={(event) => update({ keywordTerms: parseCommaList(event.target.value) })}
          />
        </label>
      </section>

      <section className="resume-settings-controls__group resume-settings-controls__group--numbers resume-settings-controls__grid">
        {NUMBER_FIELDS.map((field) => (
          <label key={field.key} className="resume-settings-controls__field">
            <span>{field.label} <InfoDot text={field.help} /></span>
            <input
              type="number"
              min={field.min}
              max={field.max}
              step={field.step}
              value={
                focusedNumberField === field.key
                  ? numericDrafts[field.key] ?? String(settings[field.key])
                  : String(settings[field.key])
              }
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
        <span className="resume-settings-controls__label">
          Text style
          <InfoDot text="On/off switches for bold, italic, and uppercase on different parts of the resume." />
        </span>
        {TOGGLE_FIELDS.map((field) => (
          <label key={field.key}>
            <input
              type="checkbox"
              checked={settings[field.key]}
              onChange={(event) => update({ [field.key]: event.target.checked })}
            />
            <span>{field.label} <InfoDot text={field.help} /></span>
          </label>
        ))}
      </section>
    </div>
  );
}
