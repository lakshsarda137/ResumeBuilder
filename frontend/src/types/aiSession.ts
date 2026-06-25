import type { AiProvider } from '../utils/aiProviders';

export interface AiChatSession {
  id: string;
  provider: AiProvider;
  tabId: number;
  chatTitle: string;
  chatUrl: string;
  createdAt: number;
  lastUsedAt: number;
}
