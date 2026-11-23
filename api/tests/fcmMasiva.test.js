import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest';
import {generateKeyPairSync} from 'node:crypto';
const state=vi.hoisted(()=>({tokens:[]}));
vi.mock('../db/neon.js',()=>({query:vi.fn(async sql=>sql.includes('information_schema.tables')?{rows:[{exists:1}]}:{rows:state.tokens.map(fcm_token=>({fcm_token}))})}));
import {sendFcmToUsuario} from '../services/fcmPush.js';
const privateKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
describe('push de asignación conjunta',()=>{
 beforeEach(()=>{process.env.FIREBASE_SERVICE_ACCOUNT_JSON=JSON.stringify({project_id:'prueba',client_email:'test@example.invalid',private_key:privateKey});state.tokens=['token-prueba'];});
 afterEach(()=>{vi.unstubAllGlobals();delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON});
 it('envía un mensaje data-only de alta prioridad con id de cola y sin datos privados',async()=>{
  const fetch=vi.fn(async url=>url.includes('oauth2')?{json:async()=>({access_token:'token-prueba',expires_in:3600})}:{ok:true});vi.stubGlobal('fetch',fetch);
  expect(await sendFcmToUsuario(5,{tipo:'asignacion_masiva',notificacionId:77,cantidad:2})).toEqual({sent:1});
  const req=fetch.mock.calls.find(([url])=>url.includes('fcm.googleapis.com'));const body=JSON.parse(req[1].body);
  expect(body.message).toEqual({token:'token-prueba',android:{priority:'high'},data:{tipo:'asignacion_masiva',notificacion_id:'77',usuario_id:'5',cantidad:'2'}});
  expect(body.message).not.toHaveProperty('notification');
 });
 it('sin configuración no simula un envío',async()=>{delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;expect(await sendFcmToUsuario(5,{tipo:'asignacion_masiva',notificacionId:77,cantidad:2})).toEqual({sent:0,skipped:true})});
});
