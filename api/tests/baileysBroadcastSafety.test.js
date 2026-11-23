import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  rawQuery: vi.fn(), query: vi.fn(), connect: vi.fn(), send: vi.fn(),
  hasColumn: vi.fn(), getArea: vi.fn(), normalize: vi.fn(), failures: vi.fn(),
}));
vi.mock('../db/neon.js', () => ({ rawQuery: mocks.rawQuery, query: mocks.query, pool: { connect: mocks.connect } }));
vi.mock('../middleware/auth.js', () => ({ authWithTenantHost: (req, _res, next) => { req.tenantId = 7; req.user = { id: 1 }; next(); }, adminOnly: (_req, _res, next) => next() }));
vi.mock('../utils/tenantScope.js', () => ({ tableHasColumn: mocks.hasColumn }));
vi.mock('../services/whatsappService.js', () => ({ sendTenantWhatsAppText: mocks.send }));
vi.mock('../services/businessType.js', () => ({ normalizeBusinessTypeInput: (s) => s }));
vi.mock('../utils/whatsappArAreaConfig.js', () => ({ getTenantConfiguracionForWhatsappAreas: mocks.getArea, normalizeArgentinaMobileWithTenantAreaConfig: mocks.normalize }));
vi.mock('../services/broadcastPhoneFailures.js', () => ({ filterPhonesNotBlocklisted: mocks.failures, applyBroadcastSendResultsToFailures: vi.fn(async () => {} ) }));
vi.mock('../services/broadcastReplyMetrics.js', () => ({ bumpBroadcastMessagesSent: vi.fn(async () => {}), getBroadcastMetricsReport: vi.fn() }));
vi.mock('../utils/whatsappBroadcastWarmup.js', () => ({ evaluateWarmupForBroadcast: vi.fn(async (_tenant, n) => ({ allowed: true, cap: n })), getWarmupStatusPayload: vi.fn() }));

import { filterBaileysBroadcastOptOut, recordBaileysBroadcastStop, pauseBaileysBroadcastForUnresolvedStop, tripLocalBaileysBroadcastStop, isBaileysBroadcastStop, normalizeBaileysBroadcastPhone, withBaileysBroadcastLease, assertBaileysBroadcastTenant } from '../services/baileysBroadcastSafety.js';
import { getBroadcastPacingConfig } from '../utils/whatsappBroadcastPacing.js';
import { assertBroadcastLocalTimeWindow } from '../utils/whatsappBroadcastGuards.js';
import router, { executeBroadcastSendLoop } from '../routes/whatsappBroadcast.js';

let lease;
function makeClient(available = true) {
  const client = new EventEmitter();
  client.query = vi.fn(async (sql) => ({ rows: sql.includes('pg_try_advisory') ? [{ locked: available }] : [] }));
  client.release = vi.fn();
  return client;
}
const savedEnv = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...savedEnv, WHATSAPP_PROVIDER: 'baileys', BAILEYS_SESSION_ID: 'linea-1', BAILEYS_BROADCAST_DELAY_MIN_MS: '0', BAILEYS_BROADCAST_DELAY_MAX_MS: '0' };
  lease = makeClient(); mocks.connect.mockResolvedValue(lease);
  mocks.hasColumn.mockResolvedValue(true);
  mocks.getArea.mockResolvedValue({}); mocks.normalize.mockImplementation((s) => s);
  mocks.failures.mockImplementation(async (_t, phones) => phones);
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.rawQuery.mockImplementation(async (sql) => {
    if (sql.includes('SUM(destinatarios_total)')) return { rows: [{ s: 2 }] };
    if (sql.includes('FROM configuracion')) return { rows: [{ value: { tenant_id: 7, locked: true } }] };
    if (sql.includes('FROM socios_catalogo')) return { rows: [
      { telefono: '5493430000001', acepta_avisos: true, activo: true, bt: 'agua' },
      { telefono: '5493430000002', acepta_avisos: true, activo: true, bt: 'agua' },
    ] };
    return { rows: [] };
  });
  mocks.send.mockResolvedValue({ ok: true });
});
afterEach(() => { process.env = { ...savedEnv }; });

describe('protección masivos Baileys', () => {
  it('usa límites propios y no altera configuración de Whapi ni Meta', () => {
    delete process.env.BAILEYS_BROADCAST_DELAY_MIN_MS; delete process.env.BAILEYS_BROADCAST_DELAY_MAX_MS;
    expect(getBroadcastPacingConfig()).toMatchObject({ isBaileys: true, delayMinMs: 30000, delayMaxMs: 90000, maxPerJob: 25, maxPerDay: 100 });
    process.env.WHATSAPP_PROVIDER = 'whapi';
    expect(getBroadcastPacingConfig()).toMatchObject({ isWhapi: true, delayMinMs: 30000, maxPerDay: 0 });
    process.env.WHATSAPP_PROVIDER = 'meta';
    expect(getBroadcastPacingConfig()).toMatchObject({ isWhapi: false, delayMinMs: 400 });
  });
  it('registra y excluye STOP para toda la sesión, normalizando variantes argentinas', async () => {
    expect(isBaileysBroadcastStop(' STOP ')).toBe(true);
    expect(isBaileysBroadcastStop('no quiero recibir avisos')).toBe(true);
    expect(isBaileysBroadcastStop('necesito ayuda')).toBe(false);
    expect(normalizeBaileysBroadcastPhone('543430000001')).toBe('5493430000001');
    await recordBaileysBroadcastStop('543430000001');
    expect(mocks.rawQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO baileys_broadcast_opt_out'), ['linea-1', '5493430000001']);
    mocks.rawQuery.mockImplementation(async (sql) => ({ rows: sql.includes('SELECT phone_digits') ? [{ phone_digits: '5493430000001' }] : [] }));
    expect(await filterBaileysBroadcastOptOut(['543430000001', '5493430000002'])).toEqual(['5493430000002']);
  });
  it('se detiene ante baja no resoluble, tabla ausente o sesión pausada', async () => {
    await pauseBaileysBroadcastForUnresolvedStop();
    expect(mocks.rawQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO baileys_broadcast_safety_state'), ['linea-1']);
    mocks.rawQuery.mockResolvedValueOnce({ rows: [{ paused: true }] });
    await expect(filterBaileysBroadcastOptOut(['5493430000001'])).rejects.toThrow('pausados');
    mocks.rawQuery.mockRejectedValueOnce(new Error('no existe la tabla'));
    await expect(filterBaileysBroadcastOptOut(['5493430000001'])).rejects.toThrow('tabla');
  });
  it('exige tenant fijado correctamente', async () => {
    await assertBaileysBroadcastTenant(7);
    await expect(assertBaileysBroadcastTenant(8)).rejects.toThrow('no está fijada');
  });
  it('bloquea campañas concurrentes y libera la transacción tras error', async () => {
    const busy = makeClient(false); mocks.connect.mockResolvedValueOnce(busy);
    await expect(withBaileysBroadcastLease(() => {})).rejects.toThrow('Ya hay');
    expect(busy.query).toHaveBeenCalledWith('ROLLBACK'); expect(busy.release).toHaveBeenCalled();
    await expect(withBaileysBroadcastLease(async (check) => { await check(); throw Error('falló'); })).rejects.toThrow('falló');
    expect(lease.query).toHaveBeenCalledWith('ROLLBACK'); expect(lease.release).toHaveBeenCalled();
  });
  it('frena al primer fallo sin contabilizar números no intentados', async () => {
    mocks.send.mockResolvedValueOnce({ ok: false, error: 'baileys_not_connected' });
    const result = await executeBroadcastSendLoop({ tenantId: 7, businessType: 'agua', telefonos: ['5493430000001', '5493430000002'], bodyText: 'Aviso', comunicacionId: 12 });
    expect(result).toMatchObject({ ok: 0, err: 1, attemptedPhones: ['5493430000001'] });
    expect(result.abortReason).toMatch(/detenido/); expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('vuelve a comprobar STOP antes de cada destinatario', async () => {
    mocks.rawQuery.mockImplementation(async (sql) => {
      if (sql.includes('SUM(destinatarios_total)')) return { rows: [{ s: 2 }] };
      if (sql.includes('FROM configuracion')) return { rows: [{ value: { tenant_id: 7, locked: true } }] };
      if (sql.includes('FROM socios_catalogo')) return { rows: [{ telefono: '5493430000001', acepta_avisos: true, activo: true, bt: 'agua' }, { telefono: '5493430000002', acepta_avisos: true, activo: true, bt: 'agua' }] };
      if (sql.includes('SELECT phone_digits')) return { rows: mocks.send.mock.calls.length ? [{ phone_digits: '5493430000002' }] : [] };
      return { rows: [] };
    });
    const r = await executeBroadcastSendLoop({ tenantId: 7, businessType: 'agua', telefonos: ['5493430000001', '5493430000002'], bodyText: 'Aviso', comunicacionId: 12 });
    expect(r.ok).toBe(1); expect(r.attemptedPhones).toEqual(['5493430000001']);
  });
  it('encola desde HTTP y registra error al fallar el primer destinatario', async () => {
    mocks.send.mockResolvedValueOnce({ ok: false, error: 'baileys_not_connected' });
    mocks.query.mockImplementation(async (sql) => {
      if (sql.includes('INSERT INTO comunicaciones_envios')) return { rows: [{ id: 91 }] };
      if (sql.includes("broadcast_status') = 'queued'")) return { rows: [{ id: 91, tenant_id: 7, business_type: 'agua', cuerpo: 'Aviso', destinatarios_total: 2 }] };
      return { rows: [] };
    });
    const app = express(); app.use(express.json()); app.use('/broadcast', router);
    const res = await request(app).post('/broadcast/community').send({ confirm: true, business_type: 'agua', mensaje: 'Aviso' });
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ async: true, comunicacion_id: 91, destinatarios: 2 });
    await vi.waitFor(() => {
      const finalized = mocks.query.mock.calls.find(([sql]) => sql.includes('errores_detalle = $5'));
      expect(finalized).toBeTruthy();
      const meta = JSON.parse(finalized[1][5]);
      expect(meta.broadcast_status).toBe('error');
      expect(meta.broadcast_abort_reason).toMatch(/detenido/);
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('rechaza ventana horaria Baileys mal configurada sin cambiar Whapi', () => {
    process.env.BAILEYS_BROADCAST_LOCAL_WINDOW = 'incorrecto';
    expect(assertBroadcastLocalTimeWindow().ok).toBe(false);
    process.env.WHATSAPP_PROVIDER = 'whapi';
    expect(assertBroadcastLocalTimeWindow().ok).toBe(true);
  });
  it('suspende el proceso si no pudo registrar una baja', async () => {
    tripLocalBaileysBroadcastStop();
    await expect(filterBaileysBroadcastOptOut(['5493430000001'])).rejects.toThrow('no se pudo registrar una baja');
    expect(mocks.rawQuery).not.toHaveBeenCalled();
  });
});
