import { spawn, type ChildProcess } from 'node:child_process';
import { createReadStream, statSync } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import http from 'node:http';

export interface EnhancementState {
  id: string; name: string; phase: 'ready'|'previewing'|'review'|'processing'|'complete'|'error'|'cancelled';
  operation?: 'enhance'|'convert';
  progress: number; error?: string; beforeUrl?: string; afterUrl?: string; output?: string;
}
interface Job { state: EnhancementState; source: string; sourceStamp: string; before: string; after: string; child?: ChildProcess; approvedPreview: boolean; cancelled: boolean; output?: string; }
export const normaliseAspect = 'scale=trunc(iw*sar/2)*2:trunc(ih/2)*2,setsar=1';
export const enhancementFilter = normaliseAspect + ',hqdn3d=1.5:1.5:3:3,scale=3840:2160:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,pad=3840:2160:(ow-iw)/2:(oh-ih)/2,unsharp=5:5:0.35:5:5:0,setsar=1';
export function sampleRange(start: unknown, duration: unknown) {
  if (typeof start !== 'number' || !Number.isFinite(start) || start < 0 || start > 86400) throw new Error('Enter a valid sample start time.');
  if (duration !== 10 && duration !== 30) throw new Error('Choose a 10 or 30 second sample.');
  return {start,duration};
}
export class EnhancementEngine {
  private jobs = new Map<string,Job>();
  private server?: http.Server;
  private origin = '';
  private lastId?: string;
  current() { return this.lastId ? this.state(this.lastId) : null; }
  active() { return [...this.jobs.values()].some(j => ['previewing','processing'].includes(j.state.phase)); }
  constructor(private binary: string, private directory: string) {}
  async available() {
    await new Promise<void>((resolve,reject)=>{
      const child=spawn(this.binary,['-version'],{stdio:'ignore',windowsHide:true});
      child.on('error',()=>reject(new Error('Local video processor is not installed in this build.')));
      child.on('exit',code=>code===0?resolve():reject(new Error('Video processor cannot start.')));
    });
  }
  async add(source: string) {
    if(this.active())throw new Error('Finish or cancel the current enhancement first.');
    await this.available();
    const info=await stat(source);
    if(!info.isFile() || !/\.(mp4|mov|mkv|webm|m4v|avi)$/i.test(source)) throw new Error('Choose a movie file.');
    await mkdir(this.directory,{recursive:true});
    if(!this.server) await this.listen();
    const id=randomUUID();
    const job:Job={state:{id,name:path.basename(source),phase:'ready',progress:0}, source,sourceStamp:`${info.size}:${info.mtimeMs}`,before:path.join(this.directory,`${id}-before.mp4`),after:path.join(this.directory,`${id}-after.mp4`),approvedPreview:false,cancelled:false};
    this.jobs.set(id,job);this.lastId=id;return {...job.state};
  }
  state(id:string) { return {...this.get(id).state}; }
  private get(id:string) { const job=this.jobs.get(id);if(!job)throw new Error('Choose a movie first.');return job; }
  preview(id:string,start:number,duration:number) {
    sampleRange(start,duration);
    const j=this.get(id);this.idle(j);j.cancelled=false;j.approvedPreview=false;
    j.state={id,name:j.state.name,phase:'previewing',progress:0,operation:'enhance'};
    void (async()=>{
      try {
        await this.encode(j,j.before,start,duration,false,0,0.25);
        await this.encode(j,j.after,start,duration,true,0.25,0.75);
        if(j.cancelled)return;
        j.approvedPreview=true;j.state={...j.state,phase:'review',progress:1,beforeUrl:`${this.origin}/${id}/before`,afterUrl:`${this.origin}/${id}/after`};
      } catch(e){this.failure(j,e);}
    })();return {...j.state};
  }
  full(id:string,output:string) {
    const j=this.get(id);this.idle(j);
    const current=statSync(j.source);
    if(`${current.size}:${current.mtimeMs}`!==j.sourceStamp)throw new Error('The original changed. Choose it again and generate a fresh sample.');
    if(j.state.phase!=='review' || !j.approvedPreview || !j.state.beforeUrl || !j.state.afterUrl)throw new Error('Generate and review a sample before processing the movie.');
    if(path.resolve(output)===path.resolve(j.source))throw new Error('Save to a new file to preserve the original.');
    j.cancelled=false;j.output=output;j.state={...j.state,phase:'processing',progress:0,error:undefined,output:undefined};
    void this.encode(j,output,0,undefined,true,0,1).then(()=>{
      if(!j.cancelled)j.state={...j.state,phase:'complete',progress:1,output};
    }).catch(e=>this.failure(j,e));return {...j.state};
  }
  convert(id:string,output:string) {
    const j=this.get(id);this.idle(j);
    if(this.active())throw new Error('Finish or cancel the current process first.');
    const current=statSync(j.source);
    if(`${current.size}:${current.mtimeMs}`!==j.sourceStamp)throw new Error('The original changed. Choose it again.');
    if(path.resolve(output)===path.resolve(j.source))throw new Error('Save to a new file to preserve the original.');
    if(!/\.mp4$/i.test(output))throw new Error('Save the movie with an .mp4 extension.');
    j.cancelled=false;j.output=output;
    j.state={id,name:j.state.name,phase:'processing',progress:0,operation:'convert'};
    void this.encode(j,output,0,undefined,false,0,1).then(()=>{
      if(!j.cancelled)j.state={...j.state,phase:'complete',progress:1,output};
    }).catch(e=>this.failure(j,e));return {...j.state};
  }
  cancel(id:string) { const j=this.get(id);if(!['previewing','processing'].includes(j.state.phase))return;j.cancelled=true;j.child?.kill('SIGTERM');j.state={...j.state,phase:'cancelled',error:undefined}; }
  private idle(j:Job){if(j.child || ['previewing','processing'].includes(j.state.phase))throw new Error('Wait for the current process or cancel it.');}
  private failure(j:Job,e:unknown){if(!j.cancelled)j.state={...j.state,phase:'error',error:e instanceof Error?e.message:'Processing failed'};}
  private async encode(j:Job,output:string,start:number,duration:number|undefined,enhance:boolean,base:number,weight:number) {
    if(j.cancelled)throw new Error('Cancelled');
    // Use a temporary output and never overwrite an existing movie.
    const temp=path.join(path.dirname(output),`.${path.basename(output)}.${randomUUID()}.processing.mp4`);
    const args=['-hide_banner','-nostdin','-y','-protocol_whitelist','file,pipe',...(duration?['-ss',String(start)]:[]),'-i',j.source,...(duration?['-t',String(duration)]:[]),'-map','0:v:0','-map','0:a:0?','-vf',enhance?enhancementFilter:normaliseAspect,'-c:v','libx264','-threads','4','-filter_threads','2','-preset','fast','-crf',enhance?'20':'18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-progress','pipe:1',temp];
    let error='',progressBuffer='',total=duration??0;
    try {
      await new Promise<void>((resolve,reject)=>{
        const child=spawn(this.binary,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});j.child=child;
        child.stderr!.on('data',chunk=>{
          error=(error+String(chunk)).slice(-6000);
          if(!total){const m=error.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);if(m)total=Number(m[1])*3600+Number(m[2])*60+Number(m[3]);}
        });
        child.stdout!.on('data',chunk=>{progressBuffer+=String(chunk);const lines=progressBuffer.split('\n');progressBuffer=lines.pop()??'';for(const line of lines){const m=line.match(/^out_time_us=(\d+)/);if(m&&total&&!j.cancelled)j.state.progress=Math.min(0.99,base+Number(m[1])/1e6/total*weight);}});
        child.on('error',reject);
        child.on('close',code=>{j.child=undefined;if(j.cancelled)reject(new Error('Cancelled'));else if(code===0)resolve();else reject(new Error('Video processing failed. Check free disk space and that the source video plays correctly. '+error.slice(-400)));});
      });
      if((await stat(temp)).size<1024)throw new Error('No usable video was produced. Choose a sample inside the movie.');
      // COPYFILE_EXCL prevents overwriting the original or an existing export.
      const fs=await import('node:fs/promises');
      if(output===j.before||output===j.after)await fs.rename(temp,output);
      else {await fs.copyFile(temp,output,1);await fs.unlink(temp);}
    }catch(e){await unlink(temp).catch(()=>{});throw e;}
  }
  private async listen(){
    this.server=http.createServer(async(req,res)=>{
      const match=/^\/([a-f0-9-]+)\/(before|after)$/.exec(req.url??'');
      const j=match?this.jobs.get(match[1]!):undefined;
      if(!j||!match||!j.approvedPreview||!['GET','HEAD'].includes(req.method??'')){res.writeHead(404);res.end();return;}
      try {
        const file=match[2]==='before'?j.before:j.after;const {size}=await stat(file);
        let start=0,end=size-1;const range=req.headers.range;
        if(range){const r=/^bytes=(\d+)-(\d*)$/.exec(range);if(!r){res.writeHead(416);res.end();return;}start=Number(r[1]);end=r[2]?Math.min(Number(r[2]),end):end;if(start>end){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return;}}
        res.writeHead(range?206:200,{'Content-Type':'video/mp4','Cache-Control':'no-store','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});
        if(req.method==='HEAD'){res.end();return;}
        const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
      }catch{res.writeHead(404);res.end();}
    });
    await new Promise<void>((resolve,reject)=>{this.server!.once('error',reject);this.server!.listen(0,'127.0.0.1',()=>{const a=this.server!.address() as {port:number};this.origin=`http://127.0.0.1:${a.port}`;resolve();});});
  }
  async dispose(){
    // Terminate all workers synchronously before async cleanup or Electron exit.
    for(const j of this.jobs.values())this.cancel(j.state.id);
    this.server?.close();
    await Promise.all([...this.jobs.values()].flatMap(j=>[unlink(j.before).catch(()=>{}),unlink(j.after).catch(()=>{})]));
  }
}
