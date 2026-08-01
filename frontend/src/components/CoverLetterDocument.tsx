import { type CSSProperties, useCallback, useMemo } from 'react';
import type { CoverLetterData } from '../types/coverLetter';
import { makeCoverLetterParagraph } from '../types/coverLetter';
import {
  mergeCoverLetterRenderSettings,
  type CoverLetterRenderSettings,
} from '../utils/coverLetterSettings';
import { EditableText } from './EditableText';
import { cssFontFamily } from './ResumeDocument';
import './CoverLetterDocument.css';

interface CoverLetterDocumentProps {
  data: CoverLetterData;
  onChange: (data: CoverLetterData, immediateHistory?: boolean) => void;
  editing?: boolean;
  id?: string;
  settings?: CoverLetterRenderSettings;
  /**
   * Show the model's per-paragraph job-description match notes. Screen only —
   * the notes carry `data-jd-note`, which the PDF writer skips, exactly like
   * the resume's JD notes.
   */
  showJdNotes?: boolean;
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function grayscaleFromIntensity(intensity: number) {
  const channel = Math.round(255 * (1 - intensity / 100));
  return `rgb(${channel}, ${channel}, ${channel})`;
}

export function CoverLetterDocument({
  data,
  onChange,
  editing = true,
  id = 'cover-letter-document',
  settings,
  showJdNotes = false,
}: CoverLetterDocumentProps) {
  const effectiveSettings = useMemo(() => mergeCoverLetterRenderSettings(settings), [settings]);

  const pageStyle = useMemo(
    () =>
      ({
        '--resume-body-font': cssFontFamily(effectiveSettings.bodyFontFamily),
        '--resume-name-font': cssFontFamily(effectiveSettings.nameFontFamily),
        '--resume-name-size': `${effectiveSettings.nameFontSize}pt`,
        '--resume-body-size': `${effectiveSettings.bodyFontSize}pt`,
        '--resume-text-color': grayscaleFromIntensity(effectiveSettings.textIntensity),
        '--resume-body-weight': effectiveSettings.bodyTextWeight,
        '--resume-strong-weight': effectiveSettings.boldTextWeight,
        '--resume-name-weight': effectiveSettings.boldTextWeight,
        '--resume-line-height': effectiveSettings.lineHeight,
        '--resume-page-padding-top': `${effectiveSettings.pagePaddingTop}in`,
        '--resume-page-padding-left': `${effectiveSettings.pagePaddingLeft}in`,
        '--resume-page-padding-right': `${effectiveSettings.pagePaddingRight}in`,
        '--resume-page-padding-bottom': `${effectiveSettings.pagePaddingBottom}in`,
        '--cl-paragraph-spacing': `${effectiveSettings.paragraphSpacing}pt`,
        '--cl-header-spacing': `${effectiveSettings.headerSpacing}pt`,
        '--cl-date-weight': effectiveSettings.dateBold
          ? effectiveSettings.boldTextWeight
          : effectiveSettings.bodyTextWeight,
        '--cl-date-style': effectiveSettings.dateItalic ? 'italic' : 'normal',
        '--cl-signature-style': effectiveSettings.signatureItalic ? 'italic' : 'normal',
      }) as CSSProperties,
    [effectiveSettings],
  );

  const emitChange = useCallback(
    (newData: CoverLetterData, immediateHistory = false) => {
      onChange(newData, immediateHistory);
    },
    [onChange],
  );

  const updateContactName = useCallback(
    (value: string) => emitChange({ ...data, contact: { ...data.contact, name: value } }),
    [data, emitChange],
  );

  const updateContactLink = useCallback(
    (linkId: string, value: string) =>
      emitChange({
        ...data,
        contact: {
          ...data.contact,
          links: data.contact.links.map((link) => (link.id === linkId ? { ...link, value } : link)),
        },
      }),
    [data, emitChange],
  );

  const addContactLink = useCallback(() => {
    emitChange(
      {
        ...data,
        contact: {
          ...data.contact,
          links: [...data.contact.links, { id: generateId(), value: 'email or phone' }],
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
          contact: { ...data.contact, links: data.contact.links.filter((link) => link.id !== linkId) },
        },
        true,
      );
    },
    [data, emitChange],
  );

  const updateDate = useCallback((value: string) => emitChange({ ...data, date: value }), [data, emitChange]);

  const updateGreeting = useCallback(
    (value: string) => emitChange({ ...data, greeting: value }),
    [data, emitChange],
  );

  const updateParagraph = useCallback(
    (paragraphId: string, value: string) =>
      emitChange({
        ...data,
        paragraphs: data.paragraphs.map((paragraph) =>
          paragraph.id === paragraphId ? { ...paragraph, text: value } : paragraph,
        ),
      }),
    [data, emitChange],
  );

  const addParagraph = useCallback(() => {
    emitChange(
      { ...data, paragraphs: [...data.paragraphs, makeCoverLetterParagraph(generateId(), 'New paragraph.')] },
      true,
    );
  }, [data, emitChange]);

  const removeParagraph = useCallback(
    (paragraphId: string) => {
      emitChange(
        { ...data, paragraphs: data.paragraphs.filter((paragraph) => paragraph.id !== paragraphId) },
        true,
      );
    },
    [data, emitChange],
  );

  const updateClosing = useCallback((value: string) => emitChange({ ...data, closing: value }), [data, emitChange]);

  const updateSignatureName = useCallback(
    (value: string) => emitChange({ ...data, signatureName: value }),
    [data, emitChange],
  );

  return (
    <div className="resume-page-wrapper">
      <div
        className={`resume-page cover-letter-page${editing ? '' : ' resume-page--print'}`}
        id={id}
        style={pageStyle}
      >
        <header className="resume-header cl-header">
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

        <div className="cl-date-block">
          <EditableText
            tag="p"
            className="cl-date"
            value={data.date}
            onChange={updateDate}
            placeholder="Month Day, Year"
            editing={editing}
          />
        </div>

        <EditableText
          tag="p"
          className="cl-greeting"
          value={data.greeting}
          onChange={updateGreeting}
          placeholder="Dear Hiring Team,"
          editing={editing}
        />

        <div className="cl-paragraphs">
          {data.paragraphs.map((paragraph) => (
            <div
              key={paragraph.id}
              className="cl-paragraph-row"
              {...(showJdNotes && paragraph.jdComment
                ? { 'data-jd-anchor': `cl-paragraph-${paragraph.id}` }
                : {})}
            >
              {editing && (
                <button
                  type="button"
                  className="resume-control resume-control--remove-bullet"
                  onClick={() => removeParagraph(paragraph.id)}
                  title="Remove paragraph"
                >
                  ×
                </button>
              )}
              <EditableText
                tag="p"
                className="cl-paragraph"
                value={paragraph.text}
                onChange={(v) => updateParagraph(paragraph.id, v)}
                placeholder="Write a paragraph."
                multiline
                editing={editing}
              />
            </div>
          ))}
          {editing && (
            <button
              type="button"
              className="resume-control resume-control--rail"
              data-rail="entry"
              onClick={addParagraph}
            >
              + paragraph
            </button>
          )}
        </div>

        <EditableText
          tag="p"
          className="cl-closing"
          value={data.closing}
          onChange={updateClosing}
          placeholder="Sincerely,"
          editing={editing}
        />
        <EditableText
          tag="p"
          className="cl-signature"
          value={data.signatureName}
          onChange={updateSignatureName}
          placeholder="Your Name"
          editing={editing}
        />
      </div>
    </div>
  );
}
