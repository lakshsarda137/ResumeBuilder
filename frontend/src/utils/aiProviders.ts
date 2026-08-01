export type AiProvider = 'claude' | 'chatgpt' | 'gemini';

export interface AiProviderConfig {
  id: AiProvider;
  label: string;
  openUrl: string;
  hostPatterns: string[];
}

export const AI_PROVIDERS: AiProviderConfig[] = [
  {
    id: 'claude',
    label: 'Claude',
    openUrl: 'https://claude.ai/new',
    hostPatterns: ['https://claude.ai/*'],
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    openUrl: 'https://chatgpt.com/',
    hostPatterns: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    openUrl: 'https://gemini.google.com/app',
    hostPatterns: ['https://gemini.google.com/*'],
  },
];

const STORAGE_KEY = 'resume-builder-ai-provider';

export function getSavedProvider(): AiProvider {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'claude' || saved === 'chatgpt' || saved === 'gemini') {
    return saved;
  }
  return 'claude';
}

export function saveProvider(provider: AiProvider) {
  localStorage.setItem(STORAGE_KEY, provider);
}

const INCOGNITO_STORAGE_KEY = 'resume-builder-ai-incognito';

export function getSavedIncognito(): boolean {
  return localStorage.getItem(INCOGNITO_STORAGE_KEY) === 'true';
}

export function saveIncognito(incognito: boolean) {
  localStorage.setItem(INCOGNITO_STORAGE_KEY, incognito ? 'true' : 'false');
}

const COVER_LETTER_ENABLED_KEY = 'resume-builder-cover-letter-enabled';
const COVER_LETTER_PROVIDER_KEY = 'resume-builder-cover-letter-provider';

export function getSavedCoverLetterEnabled(): boolean {
  return localStorage.getItem(COVER_LETTER_ENABLED_KEY) === 'true';
}

export function saveCoverLetterEnabled(enabled: boolean) {
  localStorage.setItem(COVER_LETTER_ENABLED_KEY, enabled ? 'true' : 'false');
}

/**
 * The cover letter's model is chosen independently of the resume's. A council
 * run has no single "the" provider to inherit, and the letter is always written
 * by one model regardless.
 */
export function getSavedCoverLetterProvider(): AiProvider {
  const saved = localStorage.getItem(COVER_LETTER_PROVIDER_KEY);
  if (saved === 'claude' || saved === 'chatgpt' || saved === 'gemini') {
    return saved;
  }
  return 'claude';
}

export function saveCoverLetterProvider(provider: AiProvider) {
  localStorage.setItem(COVER_LETTER_PROVIDER_KEY, provider);
}

export function getProviderConfig(provider: AiProvider) {
  return AI_PROVIDERS.find((item) => item.id === provider)!;
}
