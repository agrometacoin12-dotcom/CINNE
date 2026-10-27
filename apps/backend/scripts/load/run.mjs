import { writeFile, readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const [baseArg = 'http://127.0.0.1:4401', profile = 'capacity', output = '/tmp/ct-load-results.json'] = process.argv.slice(2);
const base = new URL(baseArg);
const local = base.origin === 'http://127.0.0.1:4401';
if (base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw Error('Supply an API origin only');
if (!['live-smoke','limiter','capacity','capacity-400'].includes(profile)) throw Error('Unknown profile');
if (!local && (profile !== 'live-smoke' || base.origin !== 'https://api.cinnetemple.com')) throw Error('Sustained load is restricted to the isolated local test server');
const stages = profile === 'live-smoke' ? [[1,30]] : profile === 'limiter' ? [[20,30]] : profile === 'capacity-400' ? [[400,30]] : [[10,20],[50,20],[100,20],[200,20],[400,20]];
const maxConcurrency = local ? 64 : 2;
const timeoutMs = 5000;
const token = local && profile.startsWith('capacity') ? (await readFile('/tmp/ct-load-token','utf8')).trim() : null;
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
const percentile = (values,p) => values.length ? [...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1] : null;
const round = n => n === null ? null : Math.round(n*100)/100;
const report = {startedAt:new Date().toISOString(),base:base.origin,profile,maxConcurrency,timeoutMs,
  workload:'50% browse, 30% search, 20% title detail; GET JSON only; no media downloads/auth/purchases',
  thresholds:{successfulP95Ms:500,errorRate:0.01,droppedRate:0.01},stages:[]};
const preflight = await fetch(new URL('/v1/catalogue/browse',base),{signal:AbortSignal.timeout(timeoutMs),redirect:'error'});
if (!preflight.ok) throw Error(`Preflight HTTP ${preflight.status}`);
const catalogue = await preflight.json();
const candidates = [catalogue.hero,...(catalogue.rows || []).flatMap(r=>r.items || [])].filter(Boolean);
const ids = [...new Set(candidates.map(t=>t.id))];
if (!ids.length) throw Error('No catalogue title IDs available; refusing misleading empty-data test');
report.preflightTitleCount=ids.length;
const queries = ['Lagos','love','king','night','river','unlikely-no-match'];
if(token) report.workload='40% browse, 25% search, 20% title detail, 10% authenticated profile, 5% entitlements; synthetic local account';
const routes = n => {
  if(token){
    const slot=n%20;
    if(slot>=18)return {name:'profile',path:'/v1/auth/me',auth:true,valid:b=>typeof b.id==='string'};
    if(slot===17)return {name:'entitlements',path:'/v1/entitlements',auth:true,valid:b=>Array.isArray(b)};
    if(slot<8)return {name:'browse',path:'/v1/catalogue/browse',valid:b=>Array.isArray(b.rows)};
    if(slot<13)return {name:'search',path:'/v1/catalogue/search?q='+encodeURIComponent(queries[Math.floor(n/20)%queries.length]),valid:b=>Array.isArray(b.results)};
    const id=ids[Math.floor(n/20)%ids.length];
    return {name:'title',path:'/v1/catalogue/titles/'+encodeURIComponent(id),valid:b=>b.id===id};
  }
  if (n%10 < 5) return {name:'browse',path:'/v1/catalogue/browse',valid:b=>Array.isArray(b.rows)};
  if (n%10 < 8) return {name:'search',path:'/v1/catalogue/search?q='+encodeURIComponent(queries[Math.floor(n/10)%queries.length]),valid:b=>Array.isArray(b.results)};
  const id=ids[Math.floor(n/10)%ids.length];
  return {name:'title',path:'/v1/catalogue/titles/'+encodeURIComponent(id),valid:b=>b.id===id};
};
let globalIndex=0;
for (const [rps,seconds] of stages) {
  const start=performance.now(); const active=new Set(); const samples=[]; let dropped=0; let droppedLate=0; let droppedConcurrency=0; let abortReason=null;
  const target=rps*seconds;
  async function request(index) {
    const route=routes(index);const began=performance.now();
    let status=0,ok=false,bytes=0,error=null;
    try {
      const res=await fetch(new URL(route.path,base),{signal:AbortSignal.timeout(timeoutMs),redirect:'error',headers:{'User-Agent':'CinneTemple-Bounded-Load-Test/1.0',...(route.auth?{Authorization:'Bearer '+token}:{})}});
      status=res.status; const text=await res.text();bytes=Buffer.byteLength(text);
      if(res.ok){try{ok=route.valid(JSON.parse(text));}catch{}};
      if(!ok)error=res.ok?'invalid_payload':`HTTP_${status}`;
    } catch(e){error=e.name;}
    samples.push({route:route.name,status,ok,ms:performance.now()-began,bytes,error});
    if(status===429)abortReason='Rate limiter returned 429; no further load scheduled';
    const recent=samples.slice(-20);
    if(recent.length===20 && recent.filter(s=>!s.ok).length>=3)abortReason='At least 15% errors in last 20 completions';
  }
  for(let i=0;i<target && !abortReason;i++) {
    const due=start+i*1000/rps; const delay=due-performance.now();
    if(delay>0)await sleep(delay);
    if(abortReason)break;
    // Do not issue catch-up bursts when the generator falls behind.
    if(performance.now()-due>Math.max(100,1000/rps)){dropped++;droppedLate++;continue;}
    if(active.size>=maxConcurrency){dropped++;droppedConcurrency++;continue;}
    let task=request(globalIndex++).finally(()=>active.delete(task));active.add(task);
  }
  await Promise.all(active);
  const elapsed=(performance.now()-start)/1000;
  const successes=samples.filter(s=>s.ok);
  const counts={};for(const s of samples)counts[s.status]=(counts[s.status]||0)+1;
  const summarize=ss=>({requests:ss.length,errors:ss.filter(s=>!s.ok).length,
    successP50Ms:round(percentile(ss.filter(s=>s.ok).map(s=>s.ms),.5)),
    successP95Ms:round(percentile(ss.filter(s=>s.ok).map(s=>s.ms),.95)),
    successP99Ms:round(percentile(ss.filter(s=>s.ok).map(s=>s.ms),.99))});
  const stage={targetRps:rps,scheduledSeconds:seconds,elapsedSeconds:round(elapsed),targetRequests:target,
    ...summarize(samples),dropped,droppedLate,droppedConcurrency,unscheduled:target-samples.length-dropped,
    successfulRps:round(successes.length/elapsed),errorRate:samples.length?(samples.length-successes.length)/samples.length:1,
    responseBytes:samples.reduce((n,s)=>n+s.bytes,0),statusCounts:counts,abortReason,
    routes:Object.fromEntries((token?['browse','search','title','profile','entitlements']:['browse','search','title']).map(name=>[name,summarize(samples.filter(s=>s.route===name))]))};
  stage.passed=!abortReason && stage.errorRate<=.01 && dropped/target<=.01 && stage.successP95Ms!==null && stage.successP95Ms<=500;
  report.stages.push(stage);console.log(JSON.stringify(stage));
  if(abortReason || !stage.passed && profile.startsWith('capacity'))break;
}
report.finishedAt=new Date().toISOString();
report.passed=report.stages.length===stages.length && report.stages.every(s=>s.passed);
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log('Report: '+output);
if(!report.passed)process.exitCode=2;
