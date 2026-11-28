import {describe,it,expect,vi} from 'vitest';
vi.mock('../db/neon.js',()=>({query:vi.fn(),rawQuery:vi.fn()}));
import {resolveWhatsappBotTargetForTenant} from '../services/metaTenantWhatsapp.js';
describe('resolución estricta de tenant para Baileys',()=>{
 it('obtiene datos de la entidad indicada sin usar selector global',async()=>{
  const queryTenant=vi.fn(async()=>({rows:[{id:2,nombre:'Entidad',tipo:'cooperativa_agua',activo:true}]}));
  const resolveBusiness=vi.fn(async()=>({activeBusinessType:'agua'}));
  expect(await resolveWhatsappBotTargetForTenant(2,{queryTenant,resolveBusiness})).toMatchObject({tenantId:2,businessType:'agua',rubro:'cooperativa_agua'});
  expect(queryTenant.mock.calls[0][1]).toEqual([2]);expect(resolveBusiness).toHaveBeenCalledWith(2);
 });
 it('rechaza tenant inexistente, inactivo, discordante, inválido o DB caída',async()=>{
  const resolveBusiness=vi.fn(async()=>({activeBusinessType:'agua'}));
  for(const rows of [[],[{id:1,activo:true}],[{id:2,activo:false}]]){
   await expect(resolveWhatsappBotTargetForTenant(2,{queryTenant:async()=>({rows}),resolveBusiness})).rejects.toThrow(/tenant/i);
  }
  await expect(resolveWhatsappBotTargetForTenant(0)).rejects.toThrow(/inválido/);
  await expect(resolveWhatsappBotTargetForTenant(2,{queryTenant:async()=>{throw Error('DB caída')},resolveBusiness})).rejects.toThrow('DB caída');
 });
 it('no asigna automáticamente electricidad si no se pudo verificar rubro',async()=>{
  await expect(resolveWhatsappBotTargetForTenant(2,{queryTenant:async()=>({rows:[{id:2,tipo:'desconocido'}]}),resolveBusiness:async()=>({activeBusinessType:'electricidad'})})).rejects.toThrow(/Rubro/);
 });
});
