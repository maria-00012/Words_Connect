// Replace these local adapters with HTTP implementations when the backend is ready.
export const pause = (ms = 220) => new Promise((resolve) => setTimeout(resolve, ms));
export const createId = (prefix = 'id') => `${prefix}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10)}`;
export const studentInviteUrl = (token) => `${window.location.origin}/register?invite=${encodeURIComponent(token)}`;
export const teacherInviteUrl = (token) => `${window.location.origin}/invite/teacher?token=${encodeURIComponent(token)}`;
