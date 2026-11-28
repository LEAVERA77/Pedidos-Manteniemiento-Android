/** Descifrado experimental autenticado. NO descarga ni habilita imágenes reales. */
import {createDecipheriv,createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {getMediaKeys} from '@whiskeysockets/baileys';
const MAX_IMAGE=8*1024*1024;
const MAX_ENCRYPTED=MAX_IMAGE+16+10;
function bytes32(value){
 if(!Buffer.isBuffer(value)&&!(value instanceof Uint8Array))throw Error('Metadatos de medio inválidos');
 const b=Buffer.from(value);if(b.length!==32)throw Error('Metadatos de medio inválidos');return b;
}
function match(a,b){return a.length===b.length && timingSafeEqual(a,b);}
/**
 * Autentica MAC, SHA de bytes cifrados y SHA de contenido antes de entregar
 * plaintext. Acepta solo bytes ya obtenidos mediante un transporte confiable y
 * limitado; esto NO mitiga SSRF, redirects, DNS, timeout ni bombas de imagen.
 */
export async function decryptAuthenticatedTenantImage(image,encrypted){
 if(!Buffer.isBuffer(encrypted)||encrypted.length<26||encrypted.length>MAX_ENCRYPTED)throw Error('Tamaño de medio inválido');
 const mediaKey=bytes32(image?.mediaKey),encryptedHash=bytes32(image?.fileEncSha256),plainHash=bytes32(image?.fileSha256);
 const declared=Number(image?.fileLength);
 if(!Number.isSafeInteger(declared)||declared<1||declared>MAX_IMAGE)throw Error('Tamaño declarado inválido');
 const cipherText=encrypted.subarray(0,-10),suppliedMac=encrypted.subarray(-10);
 if(cipherText.length%16!==0||!match(createHash('sha256').update(encrypted).digest(),encryptedHash))throw Error('Integridad del medio inválida');
 const {iv,cipherKey,macKey}=await getMediaKeys(mediaKey,'image');
 const expectedMac=createHmac('sha256',macKey).update(iv).update(cipherText).digest().subarray(0,10);
 if(!match(expectedMac,suppliedMac))throw Error('Autenticación del medio inválida');
 let plain;
 try{const decipher=createDecipheriv('aes-256-cbc',cipherKey,iv);plain=Buffer.concat([decipher.update(cipherText),decipher.final()]);}
 catch(_){throw Error('Descifrado del medio inválido');}
 if(plain.length!==declared||plain.length>MAX_IMAGE||!match(createHash('sha256').update(plain).digest(),plainHash))throw Error('Integridad del contenido inválida');
 return plain;
}
