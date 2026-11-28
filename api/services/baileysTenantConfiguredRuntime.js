/**
 * Adaptadores reales del motor experimental. ESTA FUNCIÓN NO SE INVOCA DESDE
 * SERVER.JS. Su existencia no habilita ni certifica producción: aún faltan
 * aislar todas las salidas heredadas, coordinación y gateway SQL.
 */
import makeWASocket, {DisconnectReason} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import {acquireBaileysTenantLease} from './baileysTenantLease.js';
import {usePostgresTenantAuthState} from './baileysTenantAuthPostgres.js';
import {createBaileysGuardPostgres} from './baileysGuardPostgres.js';
import {createBaileysTenantSafety} from './baileysTenantSafety.js';
import {createBaileysTrustedContacts} from './baileysTrustedContacts.js';
import {createBaileysTenantRuntime} from './baileysTenantRuntime.js';
import {buildTenantBotPayload,tenantInboundText} from './baileysTenantPayload.js';
import {isBaileysBroadcastStop} from './baileysBroadcastSafety.js';
import {handleInboundBaileysTenantPayload} from './whatsappBotMeta.js';

export function createBaileysTenantConfiguredRuntime(){
 if(String(process.env.WHATSAPP_PROVIDER||'').trim().toLowerCase()!=='baileys' ||
    process.env.BAILEYS_MULTITENANT_ENABLED!=='true' || process.env.SQL_GATEWAY_DISABLED!=='true')
  throw Error('La configuración experimental de Baileys no está habilitada');
 const guardStore=createBaileysGuardPostgres({enforceSpacing:true}),safety=createBaileysTenantSafety(),trusted=createBaileysTrustedContacts();
 const logger=pino({level:'silent'});
 return createBaileysTenantRuntime({guardStore,safety,resolveTrusted:trusted.isTrusted,
  buildPayload:buildTenantBotPayload,extractText:tenantInboundText,isStop:isBaileysBroadcastStop,
  handleBot:handleInboundBaileysTenantPayload,
  managerDependencies:{
   acquireLease:(tenantId,onLost)=>acquireBaileysTenantLease(tenantId,{onLost}),
   loadAuth:tenantId=>usePostgresTenantAuthState(tenantId),
   makeSocket:({auth,browser,syncFullHistory})=>makeWASocket({auth,browser,syncFullHistory,logger,printQRInTerminal:false}),
   makeQr:qr=>QRCode.toDataURL(qr,{width:300,margin:2}),
   disconnectReasons:DisconnectReason,
  },
 });
}
