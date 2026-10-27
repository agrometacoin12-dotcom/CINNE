import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { rmSync } from 'node:fs';
const backend=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const compose=resolve(backend,'scripts/load/compose.yml');
const env={PATH:process.env.PATH,NODE_ENV:'test',PORT:'4401',
  DATABASE_URL:'postgresql://ct_loadtest:disposable-local-only@127.0.0.1:55439/ct_loadtest?connection_limit=10',
  REDIS_URL:'redis://127.0.0.1:56389',JWT_SECRET:'local-load-test-fixture-secret-only',
  AUTH_DRIVER:'local',CATALOGUE_DRIVER:'prisma',CATALOGUE_SEED_DEMO:'true',SEARCH_DRIVER:'local',
  EVENTS_DRIVER:'local',PUSH_DRIVER:'local',PAYMENT_DRIVER:'mock',MEDIA_UPLOADS_DIR:'/tmp/ct-load-media',
  API_PUBLIC_URL:'http://127.0.0.1:4401',AWS_EC2_METADATA_DISABLED:'true'};
function run(bin,args,environment=env){
  const result=spawnSync(bin,args,{cwd:backend,env:environment,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status || 1);
}
const action=process.argv[2];
if(action==='setup'){
  run('docker',['compose','-f',compose,'up','-d','--wait'],process.env);
  // Nest deletes dist but a retained incremental cache can suppress re-emission.
  run('pnpm',['exec','tsc','--incremental','false']);
  run('pnpm',['exec','prisma','migrate','deploy']);
}else if(action==='seed'){
  run('node',['scripts/load/seed.cjs']);
}else if(action==='serve' || action==='serve-capacity'){
  const child=spawn('node',['scripts/load/bootstrap.cjs'],{cwd:backend,env:{...env,
    LOAD_TEST_DISABLE_THROTTLE:action==='serve-capacity'?'true':'false'},stdio:'inherit'});
  process.on('SIGINT',()=>child.kill('SIGINT'));
  process.on('SIGTERM',()=>child.kill('SIGTERM'));
  child.on('error',error=>{console.error(error);process.exitCode=1;});
  child.on('exit',code=>{process.exitCode=code || 0;});
}else if(action==='cleanup'){
  run('docker',['compose','-f',compose,'down'],process.env);
  rmSync('/tmp/ct-load-token',{force:true});
}else throw Error('Usage: local.mjs setup|serve|seed|serve-capacity|cleanup');
