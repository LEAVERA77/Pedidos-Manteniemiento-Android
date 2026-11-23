import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createGeneralApiLimiter } from '../middleware/rateLimits.js';
import { resolveJwtSecret } from '../utils/jwtSecret.js';

function appFor(opts) {
  const app = express();
  app.use(createGeneralApiLimiter({ windowMs: 60000, ...opts }));
  app.get('/api/operativa', (_req, res) => res.json({ ok: true }));
  return app;
}
const token = (userId, options = {}) => jwt.sign({ userId }, resolveJwtSecret(), options);
const get = (app, bearer) => {
  const req = request(app).get('/api/operativa');
  if (bearer) req.set('Authorization', `Bearer ${bearer}`);
  return req;
};

describe('limitador operativo compartiendo red', () => {
  it('separa usuarios autenticados en la misma IP y mantiene cuota por usuario', async () => {
    const app = appFor({ anonymousMax:2, userMax:3, ipMax:30 });
    const a = token(101), b = token(102);
    for (let i=0;i<3;i++) await get(app,a).expect(200);
    await get(app,token(101)).expect(429); // Un JWT nuevo no reinicia la cuota.
    for (let i=0;i<3;i++) await get(app,b).expect(200);
    await get(app,b).expect(429);
  });
  it('mantiene límite anónimo para JWT falsos, sin ID o vencidos', async () => {
    const app = appFor({ anonymousMax:2, userMax:3, ipMax:30 });
    const invalid = jwt.sign({userId:101}, 'otra-clave');
    await get(app,invalid).expect(200);
    await get(app,token(101, {expiresIn:-1})).expect(200);
    await get(app,jwt.sign({rol:'admin'},resolveJwtSecret())).expect(429);
    await get(app,token(101)).expect(200);
  });
  it('limita también la suma por IP aunque haya múltiples usuarios válidos', async () => {
    const app = appFor({ anonymousMax:4, userMax:4, ipMax:3 });
    await get(app,token(201)).expect(200);
    await get(app,token(202)).expect(200);
    await get(app,token(203)).expect(200);
    await get(app,token(204)).expect(429);
  });
  it('rechaza identificadores JWT que no son ID de usuario válidos', async () => {
    const app = appFor({ anonymousMax:1, userMax:5, ipMax:30 });
    await get(app,token('hola')).expect(200);
    await get(app,token(-1)).expect(429);
    await get(app,token(1)).expect(200);
  });
});
