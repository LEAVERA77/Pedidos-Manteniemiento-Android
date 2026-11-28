import {describe,it,expect} from 'vitest';
import sharp from 'sharp';
import {sanitizeTenantImage} from '../services/baileysTenantMediaSanitize.js';
describe('validación experimental de fotos',()=>{
 it('decodifica PNG y produce JPEG sin metadatos',async()=>{
  const original=await sharp({create:{width:24,height:20,channels:3,background:'#7f6030'}}).png().toBuffer();
  const output=await sanitizeTenantImage(original);const meta=await sharp(output.buffer).metadata();
  expect(output.mimeType).toBe('image/jpeg');expect(meta.format).toBe('jpeg');expect(meta.width).toBe(24);expect(meta.height).toBe(20);expect(meta.exif).toBeUndefined();
 });
 it('rechaza formatos no permitidos y contenidos malformados',async()=>{
  const svg=Buffer.from('<svg width="20" height="20" xmlns="http://www.w3.org/2000/svg"></svg>');
  await expect(sanitizeTenantImage(svg)).rejects.toThrow(/Formato/);
  await expect(sanitizeTenantImage(Buffer.from([255,216,255,1,2,3]))).rejects.toThrow();
  await expect(sanitizeTenantImage(Buffer.alloc(8*1024*1024+1))).rejects.toThrow(/grande/);
 });
 it('rechaza imágenes comprimidas con dimensiones excesivas',async()=>{
  const huge=await sharp({create:{width:5000,height:4000,channels:3,background:'#fff'}}).png().toBuffer();
  expect(huge.length).toBeLessThan(8*1024*1024);
  await expect(sanitizeTenantImage(huge)).rejects.toThrow();
 });
});
