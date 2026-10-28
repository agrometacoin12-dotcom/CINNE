import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PlaybackService } from './playback.service';
import { EntitlementService } from '../commerce/entitlement.service';
import { AdminSeriesService } from '../admin/admin-series.service';
const run = process.env.FUNDING_TEST_DATABASE_URL ? describe : describe.skip;
run('ticket isolation and concurrent catalogue edits (Postgres)',()=>{
 let db:PrismaService; let uid:string; let titleId:string; let eps:string[]; let ticketId:string; let oldId:string; let playback:PlaybackService; let admin:AdminSeriesService;
 beforeAll(async()=>{process.env.DATABASE_URL=process.env.FUNDING_TEST_DATABASE_URL;db=new PrismaService();await db.$connect();});
 afterAll(async()=>{await db?.$disconnect();});
 beforeEach(async()=>{
  uid=randomUUID(); titleId=randomUUID(); eps=[randomUUID(),randomUUID()];
  await db.user.create({data:{id:uid,email:uid+'@example.test',status:'ACTIVE'}});
  await db.catalogueTitle.create({data:{id:titleId,type:'SERIES',status:'PUBLISHED',title:'Isolation check',overview:'Test',year:2026,genres:[],cast:[],categories:[]}});
  const season=await db.season.create({data:{titleId,number:1}});
  for(let i=0;i<eps.length;i++)await db.episode.create({data:{id:eps[i],seasonId:season.id,titleId,number:i+1,name:'Episode',videoKey:'originals/video/test.mp4',durationSeconds:1000}});
  const old=await db.purchase.create({data:{userId:uid,beneficiaryUserId:uid,titleId,titleName:'Test',amountMinor:0,provider:'COINS',status:'PAID'}});
  const oldEnt=await db.entitlement.create({data:{userId:uid,titleId,purchaseId:old.id,status:'CONSUMED',createdAt:new Date(Date.now()-86400000)}}); oldId=oldEnt.id;
  const purchase=await db.purchase.create({data:{userId:uid,beneficiaryUserId:uid,titleId,titleName:'Test',amountMinor:0,provider:'COINS',status:'PAID'}});
  ticketId=(await db.entitlement.create({data:{userId:uid,titleId,purchaseId:purchase.id,createdAt:new Date(Date.now()-1000)}})).id;
  await db.episodePlayback.create({data:{userId:uid,titleId,episodeId:eps[0]!,startedAt:new Date(Date.now()-80000000),expiresAt:new Date(Date.now()-70000000),consumedAt:new Date(Date.now()-75000000),positionSeconds:990,durationSeconds:1000}});
  const catalogue={findRaw:async()=>({id:titleId,title:'Isolation',type:'series',status:'published',isPremiere:false})};
  const media={playbackUrl:()=> 'https://media.example.test/video',publicUrl:()=>null}; const audit={record:async()=>{}};
  playback=new PlaybackService(catalogue as never,new EntitlementService(db),media as never,audit as never,db);
  admin=new AdminSeriesService(catalogue as never,media as never,audit as never,{} as never,db,{get:()=>undefined} as never,{} as never);
 });
 afterEach(async()=>{
  await db.episodePlayback.deleteMany({where:{userId:uid}});
  await db.user.delete({where:{id:uid}}); await db.catalogueTitle.delete({where:{id:titleId}});
 });
 it('reopens a bought-again episode but rejects delayed old and unbound completion',async()=>{
  const session=await playback.start({sub:uid,email:'viewer@example.test'},titleId,eps[0]);
  expect(session.sessionId).toBe(ticketId); expect(session.resumeSeconds).toBe(0);
  for(const sessionId of [oldId,undefined])await expect(playback.saveProgress(uid,titleId,{positionSeconds:1000,durationSeconds:1000,sessionId},eps[0])).rejects.toThrow('another ticket');
  expect((await db.entitlement.findUniqueOrThrow({where:{id:ticketId}})).status).toBe('ACTIVE');
  expect((await db.episodePlayback.findUniqueOrThrow({where:{userId_episodeId:{userId:uid,episodeId:eps[0]!}}})).consumedAt).toBeNull();
  await playback.saveProgress(uid,titleId,{positionSeconds:50,durationSeconds:1000,sessionId:ticketId},eps[0]);
  expect((await playback.start({sub:uid,email:'viewer@example.test'},titleId,eps[0])).resumeSeconds).toBe(50);
 });
 it('concurrent starts preserve one viewing window',async()=>{
  const sessions=await Promise.all([playback.start({sub:uid,email:'v@example.test'},titleId,eps[0]),playback.start({sub:uid,email:'v@example.test'},titleId,eps[0])]);
  expect(sessions[0]!.expiresAt).toBe(sessions[1]!.expiresAt);
 });
 it('serializes simultaneous deletions so one playable episode survives',async()=>{
  const results=await Promise.allSettled(eps.map(id=>admin.deleteEpisode(id,uid)));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  expect(await db.episode.count({where:{titleId,videoKey:{not:null}}})).toBe(1);
 });
 it('serializes clearing a video against deleting the other episode',async()=>{
  const results=await Promise.allSettled([admin.updateEpisode(eps[0]!,{videoKey:null} as never,uid),admin.deleteEpisode(eps[1]!,uid)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(await db.episode.count({where:{titleId,videoKey:{not:null}}})).toBe(1);
 });
});
