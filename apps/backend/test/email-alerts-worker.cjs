// Isolated database only; never point this at production.
if (!process.env.EMAIL_ALERTS_TEST_DATABASE_URL) throw new Error('Set EMAIL_ALERTS_TEST_DATABASE_URL to an isolated migrated database');
process.env.DATABASE_URL = process.env.EMAIL_ALERTS_TEST_DATABASE_URL;
const {PrismaClient}=require(process.cwd()+'/apps/backend/node_modules/@prisma/client');
const {EmailAlertsService}=require(process.cwd()+'/apps/backend/dist/modules/notifications/email-alerts.service');
const assert=require('node:assert/strict');
(async()=>{
 const db=new PrismaClient(); const sends=[];const mail={sendPlain:async(...a)=>{sends.push(a);}};
 const config={get:()=>['admin@example.test','admin@example.test']};
 try {
 await db.$executeRaw`SELECT ct_queue_mail('worker-concurrency','viewer@example.test','Test','Body')`;
 await db.$executeRaw`SELECT ct_queue_mail('worker-admin','@admins','Admin test','Body')`;
 await Promise.all([new EmailAlertsService(db,mail,config).drain(),new EmailAlertsService(db,mail,config).drain()]);
 assert.equal(sends.length,2);assert.equal(new Set(sends.map(x=>x[3])).size,2);
 const rows=await db.$queryRaw`SELECT status FROM email_alerts WHERE event_key IN ('worker-concurrency','worker-admin')`;
 assert.equal(rows.length,3); assert(rows.every(r=>r.status==='ACCEPTED'));
 await db.$executeRaw`SELECT ct_queue_mail('worker-retry','viewer@example.test','Retry','Body')`;
 await new EmailAlertsService(db,{sendPlain:async()=>{throw new Error('offline')}},config).drain();
 let [failed]=await db.$queryRaw`SELECT * FROM email_alerts WHERE event_key='worker-retry'`;
 assert.equal(failed.status,'PENDING');assert.equal(failed.attempts,1);
 await db.$executeRaw`UPDATE email_alerts SET available_at=now() WHERE event_key='worker-retry'`;
 await new EmailAlertsService(db,mail,config).drain();
 assert.equal(sends.at(-1)[3],'alert-'+failed.id);
 console.log('PostgreSQL worker checks passed: concurrent claims, admin fanout, retained failure, stable retry key');
 }finally{await db.$executeRaw`DELETE FROM email_alerts WHERE event_key IN ('worker-concurrency','worker-admin','worker-retry')`;await db.$disconnect();}
})().catch(e=>{console.error(e);process.exitCode=1});
