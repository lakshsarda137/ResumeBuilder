import { useState } from 'react';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  DEFAULT_RESUME_RENDER_SETTINGS,
  RESUME_RENDER_TEMPLATES,
  loadResumeRenderSettings,
  mergeResumeRenderSettings,
  parseCommaList,
  saveResumeRenderSettings,
  type ResumeRenderSettings,
} from '../utils/resumeSettings';
import './SettingsPage.css';

const FONT_OPTIONS = [
  'Times New Roman',
  'Georgia',
  'Cambria',
  'Garamond',
  'Arial',
  'Inter',
];

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

export function SettingsPage() {
  const [settings, setSettingsState] = useState(loadResumeRenderSettings);

  function setSettings(next: ResumeRenderSettings) {
    setSettingsState(next);
    saveResumeRenderSettings(next);
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
          onClick={() => setSettings(DEFAULT_RESUME_RENDER_SETTINGS)}
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
          <label className="field">
            <span>Section headings</span>
            <input
              value={settings.sectionHeadings.join(', ')}
              onChange={(event) =>
                setSettings(
                  updateSetting(settings, {
                    sectionHeadings: parseCommaList(event.target.value),
                  }),
                )
              }
            />
          </label>
          <label className="field">
            <span>Keyword terms</span>
            <input
              value={settings.keywordTerms.join(', ')}
              onChange={(event) =>
                setSettings(
                  updateSetting(settings, {
                    keywordTerms: parseCommaList(event.target.value),
                  }),
                )
              }
            />
          </label>
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
            <span>Heading font</span>
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
          <label className="field">
            <span>Name size</span>
            <input
              type="number"
              min={16}
              max={32}
              step={0.5}
              value={settings.nameFontSize}
              onChange={(event) =>
                setSettings(
                  updateSetting(settings, {
                    nameFontSize: Number(event.target.value),
                  }),
                )
              }
            />
          </label>
          <label className="field">
            <span>Heading size</span>
            <input
              type="number"
              min={8}
              max={16}
              step={0.5}
              value={settings.headingFontSize}
              onChange={(event) =>
                setSettings(
                  updateSetting(settings, {
                    headingFontSize: Number(event.target.value),
                  }),
                )
              }
            />
          </label>
          <label className="field">
            <span>Body size</span>
            <input
              type="number"
              min={8}
              max={14}
              step={0.25}
              value={settings.bodyFontSize}
              onChange={(event) =>
                setSettings(
                  updateSetting(settings, {
                    bodyFontSize: Number(event.target.value),
                  }),
                )
              }
            />
          </label>
          <label className="field">
            <span>Bullet size</span>
            <input
              type="number"
              min={8}
              max={14}
              step={0.25}
              value={settings.bulletFontSize}
              onChange={(event) =>
                setSettings(
                  updateSetting(settings, {
                    bulletFontSize: Number(event.target.value),
                  }),
                )
              }
            />
          </label>
          <label className="field">
            <span>Line height</span>
            <input
              type="number"
              min={1}
              max={1.6}
              step={0.01}
              value={settings.lineHeight}
              onChange={(event) =>
                setSettings(
                  updateSetting(settings, {
                    lineHeight: Number(event.target.value),
                  }),
                )
              }
            />
          </label>
        </div>
      </section>
    </div>
  );
}
