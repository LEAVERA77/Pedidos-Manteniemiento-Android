import {describe,it,expect,vi,afterEach} from 'vitest';
import {storeBaileysMediaBuffer,consumeBaileysMediaBuffer} from '../services/baileysMediaStore.js';
const id=(tenant,n)=>`baileys-media:v2:test-${tenant}-${n}`;
describe('almacén efímero de medios tenant',()=>{
 afterEach(()=>vi.useRealTimers());
 it('aplica cuota por tenant y evita que otra entidad reemplace o consuma',()=>{
  const data=Buffer.from('image');
  for(let n=0;n<4;n++)storeBaileysMediaBuffer(id(1,n),data,'image/jpeg',{tenantId:1});
  expect(()=>storeBaileysMediaBuffer(id(1,4),data,'image/jpeg',{tenantId:1})).toThrow(/Cupo/);
  expect(()=>storeBaileysMediaBuffer(id(1,0),data,'image/jpeg',{tenantId:2})).toThrow(/duplicado/);
  expect(consumeBaileysMediaBuffer(id(1,0),{tenantId:2})).toBeNull();
  storeBaileysMediaBuffer(id(2,0),data,'image/jpeg',{tenantId:2});
  for(let n=0;n<4;n++)expect(consumeBaileysMediaBuffer(id(1,n),{tenantId:1}).buffer).toEqual(data);
  expect(consumeBaileysMediaBuffer(id(2,0),{tenantId:2}).buffer).toEqual(data);
 });
 it('limpia imágenes vencidas incluso sin una nueva operación',()=>{
  vi.useFakeTimers();storeBaileysMediaBuffer(id(3,0),Buffer.from('data'),'image/jpeg',{tenantId:3});
  expect(vi.getTimerCount()).toBe(1);vi.advanceTimersByTime(5*60*1000);
  expect(vi.getTimerCount()).toBe(0);expect(consumeBaileysMediaBuffer(id(3,0),{tenantId:3})).toBeNull();
 });
 it('el cupo de bytes por tenant falla cerrado sin afectar la entidad vecina',()=>{
  const data=Buffer.alloc(8*1024*1024,1);
  storeBaileysMediaBuffer(id(4,0),data,'image/jpeg',{tenantId:4});storeBaileysMediaBuffer(id(4,1),data,'image/jpeg',{tenantId:4});
  expect(()=>storeBaileysMediaBuffer(id(4,2),Buffer.from('x'),'image/jpeg',{tenantId:4})).toThrow(/Cupo/);
  storeBaileysMediaBuffer(id(5,0),Buffer.from('x'),'image/jpeg',{tenantId:5});
  for(let n=0;n<2;n++)consumeBaileysMediaBuffer(id(4,n),{tenantId:4});consumeBaileysMediaBuffer(id(5,0),{tenantId:5});
 });
});
