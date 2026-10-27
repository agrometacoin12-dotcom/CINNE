const { PrismaClient } = require('@prisma/client');
const { writeFileSync } = require('node:fs');
const { JwtService } = require('@nestjs/jwt');
const { randomUUID } = require('node:crypto');
const db = new URL(process.env.DATABASE_URL);
if (db.hostname !== '127.0.0.1' || db.port !== '55439' || db.pathname !== '/ct_loadtest') throw Error('Local fixture DB required');
const prisma = new PrismaClient();
(async () => {
  const template = await prisma.catalogueTitle.findFirst({where:{status:'PUBLISHED',type:'MOVIE'}});
  if (!template) throw Error('Boot the backend once to seed the demo catalogue');
  const count = await prisma.catalogueTitle.count();
  const data = Array.from({length:Math.max(0,1000-count)}, (_,i) => ({...template,
    id:randomUUID(),title:`Load fixture ${i} Lagos`,featured:false,popularity:i%100,
    videoKey:null,trailerKey:null,createdAt:undefined,updatedAt:undefined}));
  await prisma.catalogueTitle.createMany({data});
  const user = await prisma.user.upsert({where:{email:'load-fixture@example.invalid'},update:{},create:{
    email:'load-fixture@example.invalid',emailVerified:true,status:'ACTIVE',
    profile:{create:{displayName:'Local load fixture',locale:'en'}}}});
  const jwt = new JwtService({secret:'local-load-test-fixture-secret-only'});
  const token=await jwt.signAsync({email:user.email,roles:[]},{subject:user.id,expiresIn:3600,
    issuer:'https://api.cinnetemple.com',audience:'cinnetemple-clients'});
  writeFileSync('/tmp/ct-load-token',token,{mode:0o600});
  console.log('Fixture titles:',await prisma.catalogueTitle.count());
})().finally(()=>prisma.$disconnect()).catch(e=>{console.error(e);process.exitCode=1;});
