/** Contexto de una entrada interna del socket tenant, nunca desde un request HTTP. */
import {AsyncLocalStorage} from 'node:async_hooks';
const storage=new AsyncLocalStorage();
export function currentBaileysTenantContext(){return storage.getStore()||null;}
export function runBaileysTenantContext(context,fn){
 if(!context || !Number.isSafeInteger(context.tenantId) || context.tenantId<1 || typeof context.sendReply!=='function' || typeof fn!=='function')
  throw Error('Contexto Baileys inválido');
 return storage.run(context,fn);
}
