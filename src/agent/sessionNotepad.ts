const sessionNotepads: Record<string, string> = {};

export function getSessionNotepad(sessionId: string): string {
  return sessionNotepads[sessionId] || '';
}

export function updateSessionNotepad(
  sessionId: string,
  content: string,
  mode: 'append' | 'replace' = 'replace'
): string {
  if (mode === 'append' && sessionNotepads[sessionId]) {
    sessionNotepads[sessionId] = `${sessionNotepads[sessionId]}\n${content}`.trim();
  } else {
    sessionNotepads[sessionId] = content.trim();
  }
  return sessionNotepads[sessionId];
}
