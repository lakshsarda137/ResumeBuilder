import html2pdf from 'html2pdf.js';

export async function waitForLayout() {
  await document.fonts.ready;
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function getExportWrapper(elementId: string) {
  const wrapper = document.getElementById(elementId)?.closest(
    '.resume-page-wrapper',
  ) as HTMLElement | null;

  if (!wrapper) {
    throw new Error('Resume element not found');
  }

  return wrapper;
}

type CaptureState = {
  wrapper: HTMLElement;
  container: HTMLElement | null;
  wrapperStyle: string;
  containerStyle: string;
};

function beginCapture(elementId: string): CaptureState {
  const wrapper = getExportWrapper(elementId);
  const container = wrapper.parentElement;

  wrapper.classList.add('export-mode');

  const state: CaptureState = {
    wrapper,
    container,
    wrapperStyle: wrapper.style.cssText,
    containerStyle: container?.style.cssText ?? '',
  };

  if (container) {
    container.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      'width:8.5in',
      'height:auto',
      'overflow:visible',
      'z-index:2147483647',
      'pointer-events:none',
      'background:#ffffff',
    ].join(';');
  }

  wrapper.style.cssText = [
    'position:relative',
    'margin:0',
    'opacity:1',
    'visibility:visible',
    'transform:none',
  ].join(';');

  return state;
}

function endCapture(state: CaptureState) {
  state.wrapper.classList.remove('export-mode');
  state.wrapper.style.cssText = state.wrapperStyle;
  if (state.container) {
    state.container.style.cssText = state.containerStyle;
  }
}

function buildPdfOptions(filename: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: any = {
    margin: 0,
    filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      letterRendering: true,
      logging: false,
      backgroundColor: '#ffffff',
    },
    jsPDF: {
      unit: 'in',
      format: 'letter',
      orientation: 'portrait',
    },
    pagebreak: { mode: ['avoid-all'] },
  };

  return options;
}

async function renderPdf(
  elementId: string,
  filename: string,
  mode: 'save' | 'blob',
): Promise<Blob | void> {
  const state = beginCapture(elementId);

  try {
    await waitForLayout();
    const options = buildPdfOptions(filename);
    const worker = html2pdf().set(options).from(state.wrapper);

    if (mode === 'blob') {
      const blob = (await worker.outputPdf('blob')) as Blob;
      if (blob.size < 12_000) {
        throw new Error('Generated PDF appears empty. Please try again.');
      }
      return blob;
    }

    await worker.save();
  } finally {
    endCapture(state);
  }
}

export async function generateResumePdfBlob(
  elementId: string,
  filename: string,
): Promise<Blob> {
  const blob = await renderPdf(elementId, filename, 'blob');
  return blob as Blob;
}

export async function exportResumeToPdf(
  elementId: string,
  filename: string,
): Promise<void> {
  await renderPdf(elementId, filename, 'save');
}

export function validatePdfFile(file: File) {
  const isPdf =
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf');

  if (!isPdf) {
    throw new Error('Please select a PDF file.');
  }

  if (file.size === 0) {
    throw new Error('The selected PDF file is empty.');
  }
}

export async function readPdfFileAsBase64(file: File) {
  validatePdfFile(file);
  const base64 = await blobToBase64(file);
  return {
    base64,
    filename: file.name.trim() || 'resume.pdf',
  };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
