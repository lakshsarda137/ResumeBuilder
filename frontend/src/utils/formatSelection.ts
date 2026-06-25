/** Helpers for applying inline styles to contentEditable resume fields. */

export function findEditableInCanvas(node: Node | null): HTMLElement | null {
  let current: Node | null = node;
  if (current?.nodeType === Node.TEXT_NODE) {
    current = current.parentNode;
  }
  while (current instanceof HTMLElement) {
    if (current.isContentEditable && current.closest('.editor-canvas')) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

export function getEditableSelectionRange(): Range | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (!findEditableInCanvas(range.commonAncestorContainer)) {
    return null;
  }
  return range;
}

export function cloneRange(range: Range): Range {
  return range.cloneRange();
}

export function applyStyleToRange(
  range: Range,
  styles: Record<string, string>,
): Range | null {
  if (range.collapsed) {
    return null;
  }

  const span = document.createElement('span');
  for (const [key, value] of Object.entries(styles)) {
    // CSSStyleDeclaration.setProperty requires kebab-case (e.g. font-size),
    // not camelCase — direct assignment handles both fontSize and fontFamily.
    (span.style as unknown as Record<string, string>)[key] = value;
  }

  const working = range.cloneRange();

  try {
    working.surroundContents(span);
  } catch {
    span.appendChild(working.extractContents());
    working.insertNode(span);
  }

  const selection = window.getSelection();
  if (!selection) {
    return null;
  }

  selection.removeAllRanges();
  const nextRange = document.createRange();
  nextRange.selectNodeContents(span);
  nextRange.collapse(false);
  selection.addRange(nextRange);

  const editable = findEditableInCanvas(span);
  editable?.dispatchEvent(new Event('input', { bubbles: true }));

  return nextRange.cloneRange();
}

export function restoreRangeInEditable(range: Range): boolean {
  const editable = findEditableInCanvas(range.commonAncestorContainer);
  if (!editable) {
    return false;
  }

  editable.focus();
  const selection = window.getSelection();
  if (!selection) {
    return false;
  }

  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}
