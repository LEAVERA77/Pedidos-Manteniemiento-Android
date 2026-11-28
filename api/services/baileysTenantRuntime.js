/**
 * Composición experimental del motor multi-tenant. NO se inicia desde server.js.
 * Los adaptadores de socket/payload/trust son internos y deben pasar revisión real.
 * No expone sockets ni una función que permita enviar conversaciones en frío.
 */
import {createBaileysTenantManager} from './baileysTenantManager.js';
import {createBaileysGuard} from './baileysGuard.js';
import {createBaileysPolicy} from './baileysPolicy.js';
import {createBaileysTenantInbound} from './baileysTenantInbound.js';

export function createBaileysTenantRuntime({managerDependencies,guardStore,safety,resolveTrusted,buildPayload,
 extractText,isStop,handleBot,sleep,now,random}={}){
 if(!managerDependencies || !guardStore || !safety ||
    [handleBot,buildPayload,extractText,isStop,resolveTrusted,guardStore.recordInbound,guardStore.isReplyWindowOpen,
     safety.recordStop,safety.pauseTenant,safety.checkForSend].some(f=>typeof f!=='function'))
  throw Error('Dependencias del motor Baileys incompletas');
 const policy=createBaileysPolicy({guard:guardStore,safety,resolveTrusted});
 let bridge;
 const manager=createBaileysTenantManager({...managerDependencies,onInbound:args=>bridge.onInbound(args)});
 const queue=createBaileysGuard({
  isReplyWindowOpen:args=>guardStore.isReplyWindowOpen(args),
  checkAndReserve:args=>policy.checkAndReserve(args),
  assertLease:id=>manager.assertHeld(id),sleep,now,random,
 });
 bridge=createBaileysTenantInbound({manager,guardStore,queue,handleBot,buildPayload,extractText,isStop,
  recordStop:args=>safety.recordStop(args),pauseTenant:args=>safety.pauseTenant(args)});
 return {start:id=>manager.start(id),stop:id=>manager.stop(id),status:id=>manager.status(id)};
}
