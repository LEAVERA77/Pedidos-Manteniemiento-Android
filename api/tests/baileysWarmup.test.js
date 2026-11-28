import {describe,it,expect,vi} from 'vitest';
vi.mock('../db/neon.js',()=>({withTransaction:vi.fn()}));
import {warmupStatus,WARMUP_DAILY_CAPS} from '../services/baileysWarmup.js';
describe('curva warm-up por fecha local Argentina',()=>{
 it('aplica los 14 límites, de forma no decreciente',()=>{
  expect(WARMUP_DAILY_CAPS).toEqual([5,7,10,15,20,25,30,40,45,50,55,60,70,80]);
  const start='2026-05-01T15:00:00.000Z';
  for(let d=1;d<=14;d++){
   const now=new Date(new Date(start).getTime()+(d-1)*86400000);
   expect(warmupStatus({warmup_enabled:true,warmup_started_at:start},now)).toMatchObject({state:'WARMING',day:d,daily_limit:WARMUP_DAILY_CAPS[d-1]});
  }
  expect(warmupStatus({warmup_enabled:true,warmup_started_at:start},'2026-05-15T15:00:00Z').state).toBe('READY');
 });
 it('reinicia el día a medianoche argentina, no a medianoche UTC',()=>{
  const row={warmup_enabled:true,warmup_started_at:'2026-05-01T20:00:00Z',warmup_count_date:'2026-05-01',warmup_daily_sent:4};
  expect(warmupStatus(row,'2026-05-02T02:59:00Z')).toMatchObject({day:1,daily_sent:4});
  expect(warmupStatus(row,'2026-05-02T03:00:00Z')).toMatchObject({day:2,daily_sent:0});
 });
 it('inicio en el futuro falla cerrado',()=>{
  expect(()=>warmupStatus({warmup_enabled:true,warmup_started_at:'2026-05-10T15:00:00Z'},'2026-05-01T15:00:00Z')).toThrow(/futuro/);
 });
});
