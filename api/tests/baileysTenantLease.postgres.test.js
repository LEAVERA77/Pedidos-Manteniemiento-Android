import {describe,it,expect} from 'vitest';
import {acquireBaileysTenantLease} from '../services/baileysTenantLease.js';
const dsn=process.env.CAMPO_OFFLINE_TEST_DATABASE_URL || '';
if(dsn){const u=new URL(dsn);if(!['127.0.0.1','localhost','::1','[::1]'].includes(u.hostname)||u.pathname!=='/campo_offline_test')throw Error('Solo base local dedicada campo_offline_test');}
describe.skipIf(!dsn)('exclusión de sesiones Baileys con conexión dedicada',()=>{
 it('una sesión por tenant, tenants independientes y liberación segura',async()=>{
  const a=await acquireBaileysTenantLease(1,{connectionString:dsn}),b=await acquireBaileysTenantLease(2,{connectionString:dsn});
  try {
   expect(a).toBeTruthy();expect(b).toBeTruthy();await a.assertHeld();await b.assertHeld();
   expect(await acquireBaileysTenantLease(1,{connectionString:dsn})).toBeNull();
   await a.release();await expect(a.assertHeld()).rejects.toThrow(/perdió/);
   const replacement=await acquireBaileysTenantLease(1,{connectionString:dsn});expect(replacement).toBeTruthy();await replacement.release();
  } finally {await a.release();await b.release()}
 });
 it('falla cerrado sin tenant ni conexión directa',async()=>{
  await expect(acquireBaileysTenantLease(0,{connectionString:dsn})).rejects.toThrow(/Tenant/);
  await expect(acquireBaileysTenantLease(1,{connectionString:'postgresql://a:b@ep-foo-pooler.neon.tech/db'})).rejects.toThrow(/directa/);
 });
});
