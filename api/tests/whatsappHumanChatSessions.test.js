import { describe, it, expect, vi, beforeEach } from 'vitest';
const mockQuery = vi.fn();
vi.mock('../db/neon.js', () => ({ query: (...args) => mockQuery(...args) }));
vi.mock('../services/notificacionesMovilEnqueue.js', () => ({ enqueueNotificacionWhatsappHumanChatTercero: vi.fn() }));
import { humanChatOpenOrGetSession } from '../services/whatsappHumanChat.js';

describe('Chat humano: reapertura y concurrencia', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql) => {
      if (/SELECT id FROM whatsapp_human_chat_session/.test(sql)) return { rows: [] };
      if (/INSERT INTO whatsapp_human_chat_session/.test(sql)) return { rows: [{ id: 17 }] };
      return { rows: [] };
    });
  });
  it('cierra sesiones expiradas del mismo tenant antes de insertar y añade meta para tablas anteriores', async () => {
    const result = await humanChatOpenOrGetSession(3, '543434540250', 'Cliente', { expiresInHours: 48 });
    expect(result).toEqual({ id: 17, isNew: true });
    expect(mockQuery.mock.calls.some(([q]) => /ADD COLUMN IF NOT EXISTS meta JSONB/.test(q))).toBe(true);
    const expired = mockQuery.mock.calls.find(([q]) => q.includes("expires_at <= NOW()"));
    expect(expired).toBeTruthy(); expect(expired[1][0]).toBe(3);
    expect(mockQuery.mock.calls.find(([q]) => q.includes('ON CONFLICT (tenant_id, phone_canonical)'))).toBeTruthy();
  });
  it('reutiliza la sesión creada por una solicitud concurrente', async () => {
    let selects = 0;
    mockQuery.mockImplementation(async (sql) => {
      if (/SELECT id FROM whatsapp_human_chat_session/.test(sql)) return { rows: ++selects === 1 ? [] : [{ id: 23 }] };
      if (/INSERT INTO whatsapp_human_chat_session/.test(sql)) return { rows: [] };
      return { rows: [] };
    });
    const result = await humanChatOpenOrGetSession(3, '543434540250', 'Cliente', { expiresInHours: 48 });
    expect(result).toEqual({ id: 23, isNew: false });
    expect(mockQuery.mock.calls.some(([q, p]) => q.includes("expires_at = NOW()") && p[0] === 23 && p[1] === 3)).toBe(true);
  });
});
