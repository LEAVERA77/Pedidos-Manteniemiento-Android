import {describe,it,expect} from 'vitest';
import {createCipheriv,createHash,createHmac} from 'node:crypto';
import {getMediaKeys} from '@whiskeysockets/baileys';
import {decryptAuthenticatedTenantImage} from '../services/baileysTenantMediaCrypto.js';
const digest=b=>createHash('sha256').update(b).digest();
async function fixture(){
 const plain=Buffer.from([0xff,0xd8,0xff,1,2,3,4,5]),mediaKey=Buffer.alloc(32,4);
 const {iv,cipherKey,macKey}=await getMediaKeys(mediaKey,'image');
 const cipher=createCipheriv('aes-256-cbc',cipherKey,iv),cipherText=Buffer.concat([cipher.update(plain),cipher.final()]);
 const mac=createHmac('sha256',macKey).update(iv).update(cipherText).digest().subarray(0,10),encrypted=Buffer.concat([cipherText,mac]);
 return {plain,encrypted,image:{mediaKey,fileLength:plain.length,fileSha256:digest(plain),fileEncSha256:digest(encrypted)}};
}
describe('verificación criptográfica experimental de medios',()=>{
 it('acepta MAC y ambos hashes correctos',async()=>{
  const f=await fixture();expect(await decryptAuthenticatedTenantImage(f.image,f.encrypted)).toEqual(f.plain);
 });
 it('rechaza ciphertext alterado incluso si se modifica el hash cifrado',async()=>{
  const f=await fixture(),bad=Buffer.from(f.encrypted);bad[1]^=1;f.image.fileEncSha256=digest(bad);
  await expect(decryptAuthenticatedTenantImage(f.image,bad)).rejects.toThrow(/Autenticación/);
 });
 it('rechaza MAC incorrecta, hash cifrado incorrecto y hash de plaintext incorrecto',async()=>{
  const f=await fixture(),bad=Buffer.from(f.encrypted);bad[bad.length-1]^=1;
  await expect(decryptAuthenticatedTenantImage(f.image,bad)).rejects.toThrow(/Integridad/);
  f.image.fileEncSha256=digest(bad);await expect(decryptAuthenticatedTenantImage(f.image,bad)).rejects.toThrow(/Autenticación/);
  f.image.fileEncSha256=digest(f.encrypted);f.image.fileSha256=Buffer.alloc(32);
  await expect(decryptAuthenticatedTenantImage(f.image,f.encrypted)).rejects.toThrow(/contenido/);
 });
 it('rechaza metadatos faltantes, longitudes falsas y tamaño excesivo',async()=>{
  const f=await fixture();
  await expect(decryptAuthenticatedTenantImage({...f.image,mediaKey:Buffer.alloc(2)},f.encrypted)).rejects.toThrow(/Metadatos/);
  await expect(decryptAuthenticatedTenantImage({...f.image,fileLength:3},f.encrypted)).rejects.toThrow(/contenido/);
  await expect(decryptAuthenticatedTenantImage(f.image,Buffer.alloc(8*1024*1024+27))).rejects.toThrow(/Tamaño/);
  await expect(decryptAuthenticatedTenantImage({...f.image,fileLength:0},f.encrypted)).rejects.toThrow(/declarado/);
 });
});
