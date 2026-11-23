import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const state = vi.hoisted(() => ({ users: {}, notifs: [], calls: [], dbFail: null }));
vi.mock('../db/neon.js', () => ({
  query: vi.fn(async (sql, params = [], options = {}) => {
    state.calls.push({ sql, params, options });
    if (sql.startsWith('SELECT id, email, nombre, rol, activo FROM usuarios')) {
      const user = state.users[params[0]];
      return { rows: user ? [{ ...user }] : [] };
    }
    if (sql.includes('FROM notificaciones_movil') || sql.includes('UPDATE notificaciones_movil')) {
      if (state.dbFail) throw state.dbFail;
      if (sql.startsWith('SELECT id, titulo')) {
        return { rows: state.notifs.filter((n) => n.usuario_id === params[0] && n.leida === false).sort((a,b) => a.id-b.id).slice(0,15).map(({id,titulo,cuerpo,pedido_id}) => ({id,titulo,cuerpo,pedido_id})) };
      }
      if (sql.startsWith('UPDATE notificaciones_movil')) {
        const n = state.notifs.find((n) => n.id === params[0] && n.usuario_id === params[1]);
        if (!n) return { rows: [] };
        n.leida = true;
        return { rows: [{ id: n.id }] };
      }
    }
    throw new Error('SQL inesperado en prueba');
  }),
}));
vi.mock('../utils/tenantUser.js', () => ({
  getUserTenantId: async (id) => state.users[id]?.tenant_id,
  getUserTenantIdStrict: async (id) => state.users[id]?.tenant_id,
}));
vi.mock('../middleware/tenantHost.js', () => ({ tenantHostMiddleware: (_req,_res,next) => next() }));
vi.mock('../middleware/businessContext.js', () => ({ businessContextMiddleware: (_req,_res,next) => next() }));
vi.mock('../services/fcmPush.js', () => ({ upsertFcmToken: vi.fn() }));
import router from '../routes/notificaciones.js';
import { signToken } from '../middleware/auth.js';

function createApp() { const a=express(); a.use(express.json()); a.use('/notificaciones', router); return a; }
const tok = (id, tid, role='admin') => signToken({ userId:id, tenant_id:tid, rol:role });
const as = (req, token) => req.set('Authorization', `Bearer ${token}`);

beforeEach(() => {
  state.users = {
    1: {id:1,email:'a',nombre:'A',rol:'admin',activo:true,tenant_id:1},
    2: {id:2,email:'b',nombre:'B',rol:'tecnico',activo:true,tenant_id:2},
    3: {id:3,email:'c',nombre:'C',rol:'tecnico',activo:true,tenant_id:1},
  };
  state.notifs = [
    {id:11,usuario_id:1,titulo:'propia',cuerpo:'a',pedido_id:1,leida:false},
    {id:12,usuario_id:1,titulo:'leída',cuerpo:'a',pedido_id:1,leida:true},
    {id:21,usuario_id:2,titulo:'otra entidad',cuerpo:'b',pedido_id:2,leida:false},
    {id:31,usuario_id:3,titulo:'misma entidad',cuerpo:'c',pedido_id:3,leida:false},
  ];
  state.calls=[]; state.dbFail=null;
});

describe('Notificaciones propias: lectura y marcado parametrizados', () => {
  it('exige sesión y solo lista pendientes del usuario autenticado, ignorando usuario_id', async () => {
    const app=createApp();
    await request(app).get('/notificaciones/pendientes').expect(401);
    const r=await as(request(app).get('/notificaciones/pendientes?usuario_id=2'), tok(1,1)).expect(200);
    expect(r.body.rows.map((n) => n.id)).toEqual([11]);
    const c=state.calls.find((x) => x.sql.startsWith('SELECT id, titulo'));
    expect(c.params).toEqual([1]);
    expect(c.options.bypassCache).toBe(true);
    expect((await as(request(app).get('/notificaciones/pendientes'),tok(2,2,'admin')).expect(200)).body.rows.map(n=>n.id)).toEqual([21]);
  });
  it('otro usuario de la misma entidad u otra entidad no puede marcarla, tampoco manipulando el body', async () => {
    const app=createApp();
    await as(request(app).patch('/notificaciones/21/leer').send({usuario_id:2}),tok(1,1)).expect(404);
    await as(request(app).patch('/notificaciones/31/leer').send({usuario_id:3}),tok(1,1)).expect(404);
    expect(state.notifs.find(n=>n.id===21).leida).toBe(false);
    expect(state.notifs.find(n=>n.id===31).leida).toBe(false);
    await as(request(app).patch('/notificaciones/21/leer').send({usuario_id:1}),tok(2,2)).expect(200);
    expect(state.notifs.find(n=>n.id===21).leida).toBe(true);
    await as(request(app).patch('/notificaciones/21/leer'),tok(2,2)).expect(200); // idempotente
    const sql=state.calls.find(x=>x.sql.startsWith('UPDATE notificaciones_movil'));
    expect(sql.sql).toMatch(/id = \$1 AND usuario_id = \$2/);
  });
  it('rechaza IDs malformados, sesión desactivada y no expone errores internos', async () => {
    const app=createApp();
    for (const id of ['0','-1','1.2','1abc','9007199254740992']) await as(request(app).patch(`/notificaciones/${id}/leer`),tok(1,1)).expect(400);
    state.users[1].activo=false;
    await as(request(app).get('/notificaciones/pendientes'),tok(1,1)).expect(401);
    state.users[1].activo=true;
    state.dbFail=Object.assign(new Error('detalle sensible'),{code:'42703'});
    const r=await as(request(app).get('/notificaciones/pendientes'),tok(1,1)).expect(503);
    expect(JSON.stringify(r.body)).not.toContain('detalle sensible');
  });
});
