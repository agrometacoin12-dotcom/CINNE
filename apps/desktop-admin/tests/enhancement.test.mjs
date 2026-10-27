import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const {outputFiles}=await build({entryPoints:['electron/enhancement.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {EnhancementEngine,sampleRange}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const exec=promisify(execFile);
const binary=process.env.ENHANCEMENT_TEST_FFMPEG || path.resolve(`build/media-tools/${process.platform}-${process.arch}/ffmpeg`);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function finish(engine,id){for(let i=0;i<900;i++){const s=engine.state(id);if(!['previewing','processing'].includes(s.phase))return s;await wait(200);}throw Error('Processing timeout');}
test('validates sample boundaries',()=>{assert.throws(()=>sampleRange(-1,10));assert.throws(()=>sampleRange(0,600));assert.throws(()=>sampleRange(NaN,10));assert.deepEqual(sampleRange(5,30),{start:5,duration:30});});
test('real samples, approval gate, ranged playback, 4K export and original preservation',async()=>{
 await stat(binary);const dir=await mkdtemp(path.join(tmpdir(),'ct-enhance-test-'));const source=path.join(dir,'source.mp4');
 const engine=new EnhancementEngine(binary,path.join(dir,'samples'));
 try{
  await exec(binary,['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=640x360:rate=12','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',source]);
  const original=await readFile(source);const j=await engine.add(source);
  assert.throws(()=>engine.full(j.id,path.join(dir,'full.mp4')),/review/);
  engine.preview(j.id,0,10);const sample=await finish(engine,j.id);assert.equal(sample.phase,'review',sample.error);
  const before=await fetch(sample.beforeUrl,{headers:{Range:'bytes=0-99'}});assert.equal(before.status,206);assert.equal((await before.arrayBuffer()).byteLength,100);
  const after=await fetch(sample.afterUrl);assert.equal(after.status,200);await after.arrayBuffer();
  const head=await fetch(sample.afterUrl,{method:'HEAD'});assert.equal(head.status,200);assert.ok(Number(head.headers.get('Content-Length'))>1024);
  const invalid=await fetch(sample.afterUrl,{headers:{Range:'bytes=999999999999-'}});assert.equal(invalid.status,416);
  assert.throws(()=>engine.full(j.id,source),/preserve/);
  const output=path.join(dir,'enhanced.mp4');engine.full(j.id,output);const result=await finish(engine,j.id);assert.equal(result.phase,'complete',result.error);
  let metadata='';try{await exec(binary,['-i',output]);}catch(e){metadata=e.stderr;}
  assert.match(metadata,/3840x2160/);assert.match(metadata,/Audio: aac/);
  assert.deepEqual(await readFile(source),original);
  engine.preview(j.id,0,10);await finish(engine,j.id);
  const existing=path.join(dir,'existing.mp4');await writeFile(existing,'preserve existing export');engine.full(j.id,existing);assert.equal((await finish(engine,j.id)).phase,'error');assert.equal(await readFile(existing,'utf8'),'preserve existing export');
  engine.preview(j.id,0,10);engine.cancel(j.id);await wait(600);assert.equal(engine.state(j.id).phase,'cancelled');assert.deepEqual(await readFile(source),original);
 }finally{await engine.dispose();await rm(dir,{recursive:true,force:true});}
});
test('MKV converts without enhancement approval, preserves resolution, audio and source',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'ct-mkv-test-'));
 const source=path.join(dir,'movie.mkv'), output=path.join(dir,'movie-compatible.mp4');
 const engine=new EnhancementEngine(binary,path.join(dir,'samples'));
 try {
  await exec(binary,['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=640x360:rate=12','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','flac',source]);
  const original=await readFile(source), job=await engine.add(source);
  assert.throws(()=>engine.convert(job.id,source),/preserve/);
  assert.throws(()=>engine.convert(job.id,path.join(dir,'wrong.mkv')),/mp4/);
  engine.convert(job.id,output);
  const result=await finish(engine,job.id);
  assert.equal(result.phase,'complete',result.error);assert.equal(result.operation,'convert');
  let metadata='';try{await exec(binary,['-i',output]);}catch(e){metadata=e.stderr;}
  assert.match(metadata,/640x360/);assert.match(metadata,/Video: h264/);assert.match(metadata,/Audio: aac/);
  const converted=await readFile(output);
  assert.ok(converted.indexOf(Buffer.from('moov'))<converted.indexOf(Buffer.from('mdat')),'fast-start metadata precedes video');
  assert.deepEqual(await readFile(source),original);
  engine.convert(job.id,output);assert.equal((await finish(engine,job.id)).phase,'error');
  assert.deepEqual(await readFile(output),converted);
 } finally {await engine.dispose();await rm(dir,{recursive:true,force:true});}
});
