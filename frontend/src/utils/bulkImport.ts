/**
 * Turn an uploaded file into plain text for the Bulk ResumeBuilder JD editor.
 *
 *   • .pdf  → local `/api/pdf/markdown` extractor (same path the wizard uses)
 *   • .docx → local `/api/docx/text` extractor (stdlib zip parse on the server)
 *   • .txt / .md / other text → read directly in the browser
 *
 * Nothing here parses job descriptions — it only produces the raw text that
 * `parseBulkJobDescriptions` then splits on the `Job Description N` markers.
 */
import { blobToBase64 } from './pdf';

export type BulkImportSource = 'txt' | 'pdf' | 'docx';

export interface ExtractedFileText {
  filename: string;
  source: BulkImportSource;
  text: string;
}

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function postExtract(
  endpoint: string,
  base64: string,
  filename: string,
  field: 'markdown' | 'text',
): Promise<string> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, filename }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, string>;
  const value = body[field];
  if (!res.ok || !value?.trim()) {
    throw new Error(body.error ?? `Could not extract text from ${filename}.`);
  }
  return value;
}

export async function extractTextFromFile(file: File): Promise<ExtractedFileText> {
  const filename = file.name || 'file';
  const lower = filename.toLowerCase();

  if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
    const base64 = await blobToBase64(file);
    const text = await postExtract('/api/pdf/markdown', base64, filename, 'markdown');
    return { filename, source: 'pdf', text };
  }

  if (lower.endsWith('.docx') || file.type === DOCX_MIME) {
    const base64 = await blobToBase64(file);
    const text = await postExtract('/api/docx/text', base64, filename, 'text');
    return { filename, source: 'docx', text };
  }

  if (lower.endsWith('.doc')) {
    throw new Error(
      'Legacy .doc files are not supported. Save as .docx or PDF, or paste the text directly.',
    );
  }

  // Fallback: plain text (.txt, .md, or unknown but readable-as-text).
  const text = await file.text();
  if (!text.trim()) {
    throw new Error(`${filename} appears to be empty.`);
  }
  return { filename, source: 'txt', text };
}
