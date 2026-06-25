import type { AiChatSession } from '../types/aiSession';

const SESSIONS_KEY = 'resume-builder-ai-sessions';

export function loadAiSessions(): AiChatSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as AiChatSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAiSession(session: AiChatSession) {
  const sessions = loadAiSessions().filter((item) => item.id !== session.id);
  sessions.unshift(session);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, 30)));
}

export function getAiSession(sessionId: string) {
  return loadAiSessions().find((session) => session.id === sessionId);
}

export function touchAiSession(sessionId: string) {
  const sessions = loadAiSessions();
  const index = sessions.findIndex((session) => session.id === sessionId);
  if (index === -1) {
    return;
  }
  sessions[index].lastUsedAt = Date.now();
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}
