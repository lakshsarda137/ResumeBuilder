import { useRef, useEffect, useCallback } from 'react';

interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  tag?: 'span' | 'div' | 'h1' | 'h2' | 'p' | 'li';
  placeholder?: string;
  multiline?: boolean;
  editing?: boolean;
  displayValue?: string;
}

function isEmptyHtml(html: string): boolean {
  const stripped = html
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, '')
    .replace(/<[^>]*>/g, '')
    .trim();
  return stripped.length === 0;
}

function normalizeHtml(html: string): string {
  return isEmptyHtml(html) ? '' : html;
}

export function EditableText({
  value,
  onChange,
  className = '',
  tag: Tag = 'span',
  placeholder = 'Click to edit',
  multiline = false,
  editing = true,
  displayValue,
}: EditableTextProps) {
  const ref = useRef<HTMLElement>(null);
  const dirtyRef = useRef(false);
  const renderedValue = displayValue ?? value;

  const handleBlur = useCallback(() => {
    if (ref.current) {
      const html = normalizeHtml(ref.current.innerHTML);
      if (dirtyRef.current && html !== value) {
        onChange(html);
      }
      dirtyRef.current = false;
    }
  }, [onChange, value]);

  const handleInput = useCallback(() => {
    if (ref.current) {
      dirtyRef.current = true;
      const html = normalizeHtml(ref.current.innerHTML);
      if (html !== value) {
        onChange(html);
      }
    }
  }, [onChange, value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!multiline && e.key === 'Enter') {
        e.preventDefault();
        ref.current?.blur();
      }
    },
    [multiline],
  );

  useEffect(() => {
    if (!ref.current || ref.current.innerHTML === renderedValue) {
      return;
    }
    if (document.activeElement === ref.current) {
      return;
    }
    ref.current.innerHTML = renderedValue || '';
  }, [renderedValue]);

  if (!editing) {
    if (!renderedValue) {
      return <Tag className={className} />;
    }
    return (
      <Tag
        className={className}
        dangerouslySetInnerHTML={{ __html: renderedValue }}
      />
    );
  }

  return (
    <Tag
      ref={ref as React.RefObject<HTMLSpanElement & HTMLDivElement & HTMLHeadingElement & HTMLParagraphElement & HTMLLIElement>}
      className={`editable ${className} ${!renderedValue ? 'editable--empty' : ''}`}
      contentEditable
      suppressContentEditableWarning
      onBlur={handleBlur}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      data-placeholder={placeholder}
      role="textbox"
      aria-label={placeholder}
    />
  );
}
