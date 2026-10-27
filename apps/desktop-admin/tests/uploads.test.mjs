import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const {outputFiles} = await build({entryPoints:['src/lib/uploads.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const { UploadManager } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const wait = ms => new Promise(r => setTimeout(r,ms));
async function settled(manager) { for(let i=0;i<500;i++){ if(['done','error','cancelled'].includes(manager.snapshot()[0]?.status)) return manager.snapshot()[0]; await wait(10); } throw Error('timeout'); }
let active=0, peak=0, aborted=0;
class XHR {
  upload={}; status=200;
  open(method,url){this.url=url;}
  getResponseHeader(){return 'etag';}
  send(blob){ active++;peak=Math.max(peak,active);this.timer=setTimeout(()=>{active--;this.upload.onprogress?.({loaded:blob.size});this.onload();},30); }
  abort(){clearTimeout(this.timer);active--;aborted++;this.onabort?.();}
}
globalThis.XMLHttpRequest=XHR;
function fixture(attach=async()=>{}) {
  let completion;
  const api={presignUpload:async()=>({enabled:true,key:'movie',multipart:{uploadId:'id',partSize:10,parts:[1,2,3,4,5].map(partNumber=>({partNumber,uploadUrl:String(partNumber)}))}}), completeMultipartUpload:async(k,u,parts)=>{completion=parts;},uploadStat:async()=>({exists:true,size:50}),abortMultipartUpload:async()=>{}};
  const manager=new UploadManager(()=>api);
  const enqueue=()=>manager.enqueue({file:new File(['x'.repeat(50)],'movie.mp4'),kind:'video',label:'movie',onAttached:attach});
  return {manager,api,enqueue,completion:()=>completion};
}
test('uploads three parts concurrently, verifies storage and attaches before done',async()=>{
  active=peak=0; let release;const attachment=new Promise(r=>release=r);
  const f=fixture(()=>attachment);f.enqueue();await wait(100);
  assert.equal(peak,3); assert.equal(f.manager.snapshot()[0].status,'uploading');
  assert.deepEqual(f.completion().map(p=>p.partNumber),[1,2,3,4,5]);release();assert.equal((await settled(f.manager)).status,'done');
});
test('attachment failures are errors, never success',async()=>{const f=fixture(async()=>{throw Error('attach failed')});f.enqueue();assert.equal((await settled(f.manager)).error,'attach failed');});
test('cancellation aborts all active parts and does not complete',async()=>{active=aborted=0;const f=fixture();const id=f.enqueue();await wait(5);f.manager.cancel(id);await wait(60);assert.equal(aborted,3);assert.equal(active,0);assert.equal(f.completion(),undefined);assert.equal(f.manager.snapshot()[0].status,'cancelled');});
test('cancel while presigning cleans up remote multipart session',async()=>{const f=fixture();let release,cleanup=0;const old=f.api.presignUpload;f.api.presignUpload=()=>new Promise(r=>release=r);f.api.abortMultipartUpload=async()=>{cleanup++;};const id=f.enqueue();f.manager.cancel(id);release(await old());await wait(20);assert.equal(cleanup,1);assert.equal(f.completion(),undefined);});
test('storage size mismatch prevents attachment',async()=>{let attached=false;const f=fixture(async()=>{attached=true});f.api.uploadStat=async()=>({exists:true,size:1});f.enqueue();assert.match((await settled(f.manager)).error,/verification failed/);assert.equal(attached,false);});
test('attachment retry reuses verified storage instead of uploading the movie again',async()=>{
  let calls=0,signs=0;const f=fixture(async()=>{if(++calls===1)throw Error('temporary attach failure');});
  const original=f.api.presignUpload;f.api.presignUpload=async()=>{signs++;return original();};
  const id=f.enqueue();assert.equal((await settled(f.manager)).status,'error');f.manager.retry(id);
  assert.equal((await settled(f.manager)).status,'done');assert.equal(signs,1);assert.equal(calls,2);
});
test('failed part retries independently and completes in order',async()=>{
  let failed=false;
  globalThis.XMLHttpRequest=class extends XHR {send(blob){if(this.url==='2'&&!failed){failed=true;setTimeout(()=>this.onerror(),5);}else super.send(blob);}};
  const f=fixture();f.enqueue();assert.equal((await settled(f.manager)).status,'done');assert.equal(failed,true);assert.deepEqual(f.completion().map(p=>p.partNumber),[1,2,3,4,5]);
  globalThis.XMLHttpRequest=XHR;
});
