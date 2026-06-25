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

export function getProviderConfig(provider: AiProvider) {
  return AI_PROVIDERS.find((item) => item.id === provider)!;
}
