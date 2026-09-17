import type { ContactLink } from '../types/resume';
import { contactHrefLoose } from '../utils/resumeLinks';
import { EditableText } from './EditableText';

interface ContactLinkTextProps {
  link: ContactLink;
  editing: boolean;
  onChange: (patch: Partial<ContactLink>) => void;
}

/**
 * One header contact fact. A labelled link ("LinkedIn") shows only the label,
 * hyperlinked to `value`; while editing, the URL is editable in a chip beside
 * it. Unlabelled facts render their value, linked when it is an email or URL.
 */
export function ContactLinkText({ link, editing, onChange }: ContactLinkTextProps) {
  const href = contactHrefLoose(link.value);
  const label = link.label?.trim();

  const text = label ? (
    <EditableText
      tag="span"
      className="resume-contact-text"
      value={link.label ?? ''}
      onChange={(v) => onChange({ label: v })}
      placeholder="Link text"
      editing={editing}
    />
  ) : (
    <EditableText
      tag="span"
      className="resume-contact-text"
      value={link.value}
      onChange={(v) => onChange({ value: v })}
      placeholder="email, phone, or URL"
      editing={editing}
    />
  );

  return (
    <>
      {href ? (
        <a
          className="resume-link resume-contact-link"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (editing) e.preventDefault();
          }}
        >
          {text}
        </a>
      ) : (
        text
      )}
      {editing && label && (
        <span className="resume-control resume-control--url-chip">
          🔗
          <EditableText
            tag="span"
            className="resume-entry-url"
            value={link.value}
            onChange={(v) => onChange({ value: v })}
            placeholder="linkedin.com/in/username"
            editing
          />
        </span>
      )}
    </>
  );
}
