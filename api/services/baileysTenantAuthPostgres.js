/** Almacenamiento de credenciales Baileys por tenant. Borrador aún no integrado. */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys';
import { rawQuery, withTransaction } from '../db/neon.js';

function tenantId(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) throw new Error('Tenant de Baileys inválido');
  return value;
}
function encryptionKey(raw) {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(raw)) throw new Error('BAILEYS_AUTH_ENCRYPTION_KEY debe ser una clave base64 de 32 bytes');
  const key=Buffer.from(raw,'base64');
  if(key.length!==32 || key.toString('base64')!==raw) throw new Error('BAILEYS_AUTH_ENCRYPTION_KEY inválida');
  return key;
}
function keyId(category,id) {
  if(typeof category!=='string'||!category||category.length>120||typeof id!=='string'||id.length>512)
    throw new Error('Identificador de estado Baileys inválido');
  return JSON.stringify([category,id]);
}
function encrypt(tenant,category,id,plaintext,key,macKey) {
  const aad=Buffer.from(JSON.stringify(['baileys-auth-v1',tenant,category,id]));
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);
  cipher.setAAD(aad);
  const ciphertext=Buffer.concat([cipher.update(plaintext,'utf8'),cipher.final()]);
  const mac=createHmac('sha256',macKey).update(aad).update('\0').update(plaintext).digest();
  return {nonce,ciphertext,tag:cipher.getAuthTag(),mac};
}
function decrypt(tenant,category,id,row,key) {
  try {
    const aad=Buffer.from(JSON.stringify(['baileys-auth-v1',tenant,category,id]));
    const decipher=createDecipheriv('aes-256-gcm',key,row.nonce);
    decipher.setAAD(aad);decipher.setAuthTag(row.auth_tag);
    return JSON.parse(Buffer.concat([decipher.update(row.ciphertext),decipher.final()]).toString('utf8'),BufferJSON.reviver);
  } catch (_) { throw new Error('Estado Baileys ilegible o alterado; se conserva para revisión.'); }
}

/**
 * Requiere un propietario exclusivo del socket para este tenant. No hace migración,
 * DELETE ni crea tablas. Cada set es atómico y espera commit; no se hace debounce
 * diferido que pueda perder llaves Signal al reiniciar. Se evita actualizar valores
 * sin cambios mediante MAC y se agrupan las llaves de cada set en una transacción.
 */
export async function usePostgresTenantAuthState(tenant,{
  keyBase64=process.env.BAILEYS_AUTH_ENCRYPTION_KEY, query=rawQuery, transaction=withTransaction,
}={}) {
  const tid=tenantId(tenant),key=encryptionKey(keyBase64);
  const macKey=Buffer.from(hkdfSync('sha256',key,Buffer.from('gestornova-baileys-auth-v1'),Buffer.from('content-mac'),32));
  let tail=Promise.resolve(),failure=null;
  const schedule=fn=>{
    const op=tail.then(async()=>{if(failure)throw failure;try{return await fn();}catch(e){failure=e;throw e;}});
    tail=op.catch(()=>{});return op;
  };
  const credsResult=await query('SELECT nonce,ciphertext,auth_tag FROM baileys_tenant_auth WHERE tenant_id=$1 AND category=$2 AND key_id=$3',[tid,'creds','']);
  if(!credsResult.rows.length){
    const partial=await query('SELECT 1 FROM baileys_tenant_auth WHERE tenant_id=$1 LIMIT 1',[tid]);
    if(partial.rows.length)throw new Error('Estado Baileys incompleto; se conserva para revisión.');
  }
  const creds=credsResult.rows.length ? decrypt(tid,'creds','',credsResult.rows[0],key) : initAuthCreds();
  if(!creds || typeof creds!=='object' || Array.isArray(creds) || !creds.noiseKey?.private || !creds.noiseKey?.public ||
     !creds.signedIdentityKey?.private || !creds.signedIdentityKey?.public || !creds.signedPreKey?.keyPair ||
     !Number.isSafeInteger(creds.registrationId) || typeof creds.advSecretKey!=='string')
    throw new Error('Credenciales Baileys inválidas; se conservan para revisión.');
  async function persist(entries) {
    if(!entries.length)return;
    await transaction(async db=>{
      const values=entries.filter(x=>x.data!==null), deletes=entries.filter(x=>x.data===null);
      if(values.length) {
        const enc=values.map(x=>({...x,...encrypt(tid,x.category,x.id,x.data,key,macKey)}));
        await db.query(`INSERT INTO baileys_tenant_auth (tenant_id,category,key_id,nonce,ciphertext,auth_tag,content_mac)
          SELECT $1,c,i,n,v,t,m FROM UNNEST($2::text[],$3::text[],$4::bytea[],$5::bytea[],$6::bytea[],$7::bytea[]) AS x(c,i,n,v,t,m)
          ON CONFLICT (tenant_id,category,key_id) DO UPDATE SET nonce=EXCLUDED.nonce,ciphertext=EXCLUDED.ciphertext,
          auth_tag=EXCLUDED.auth_tag,content_mac=EXCLUDED.content_mac,updated_at=NOW()
          WHERE baileys_tenant_auth.content_mac IS DISTINCT FROM EXCLUDED.content_mac`,
          [tid,enc.map(x=>x.category),enc.map(x=>x.id),enc.map(x=>x.nonce),enc.map(x=>x.ciphertext),enc.map(x=>x.tag),enc.map(x=>x.mac)]);
      }
      if(deletes.length) await db.query(`DELETE FROM baileys_tenant_auth WHERE tenant_id=$1 AND (category,key_id) IN
        (SELECT c,i FROM UNNEST($2::text[],$3::text[]) AS x(c,i))`,[tid,deletes.map(x=>x.category),deletes.map(x=>x.id)]);
    });
  }
  return {
    state:{creds,keys:{
      get:async(category,ids)=>{
        if(typeof category!=='string'||category==='creds'||!Array.isArray(ids))throw new Error('Consulta de llaves Baileys inválida');
        const unique=[...new Set(ids)];for(const id of unique)keyId(category,id);
        return schedule(async()=>{
          if(!unique.length)return {};
          const r=await query('SELECT key_id,nonce,ciphertext,auth_tag FROM baileys_tenant_auth WHERE tenant_id=$1 AND category=$2 AND key_id=ANY($3::text[])',[tid,category,unique]);
          const found=new Map(r.rows.map(row=>[row.key_id,decrypt(tid,category,row.key_id,row,key)])),out={};
          for(const id of unique){let v=found.get(id)??null;if(category==='app-state-sync-key'&&v)v=proto.Message.AppStateSyncKeyData.fromObject(v);Object.defineProperty(out,id,{value:v,enumerable:true,configurable:true,writable:true});}
          return out;
        });
      },
      set:async data=>{
        if(!data || typeof data!=='object' || Array.isArray(data))throw new Error('Actualización de llaves Baileys inválida');
        const entries=[];
        for(const [category,bucket] of Object.entries(data)){
          if(category==='creds'||!bucket||typeof bucket!=='object'||Array.isArray(bucket))throw new Error('Categoría de llaves Baileys inválida');
          for(const [id,value] of Object.entries(bucket)){
            keyId(category,id);const serialized=value==null?null:JSON.stringify(value,BufferJSON.replacer);
            if(serialized===undefined)throw new Error('Llave Baileys no serializable');
            entries.push({category,id,data:serialized});
          }
        }
        return schedule(()=>persist(entries));
      },
    }},
    saveCreds:()=>{
      const data=JSON.stringify(creds,BufferJSON.replacer);
      return schedule(()=>persist([{category:'creds',id:'',data}]));
    },
    flush:()=>schedule(async()=>{}),
  };
}
