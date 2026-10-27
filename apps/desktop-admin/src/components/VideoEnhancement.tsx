import { useEffect, useRef, useState } from 'react';
import { studio } from '../lib/bridge';
import type { EnhancementState } from '../../electron/enhancement';
import { FileButton } from './ui';

export function VideoEnhancement({onFile}:{onFile:(file:File)=>void}) {
  const [job,setJob]=useState<EnhancementState|null>(null);
  const [start,setStart]=useState('0');
  const [duration,setDuration]=useState(10);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [reviewed,setReviewed]=useState(false);
  const before=useRef<HTMLVideoElement>(null),after=useRef<HTMLVideoElement>(null);
  useEffect(()=>{let alive=true;void studio.enhanceCurrent().then(s=>{if(alive)setJob(s);}).catch(()=>{});return()=>{alive=false;};},[]);
  const running=job?.phase==='previewing'||job?.phase==='processing';
  const act=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'Processing failed');}finally{setBusy(false);}};
  useEffect(()=>{
    if(!job || !running)return;
    let alive=true;
    const timer=setInterval(()=>{void studio.enhanceState(job.id).then(s=>{if(alive)setJob(s);}).catch(e=>{if(alive)setError(String(e));});},800);
    return()=>{alive=false;clearInterval(timer);};
  },[job?.id,running]);
  const pause=()=>{before.current?.pause();after.current?.pause();};
  const play=async()=>{
    const a=before.current,b=after.current;if(!a||!b)return;
    a.currentTime=0;b.currentTime=0;b.muted=true;
    try{await Promise.all([a.play(),b.play()]);}catch{pause();setError('Could not play both samples. Try their individual playback controls.');}
  };
  return <section className="enhancement-panel">
    <div className="row-flex spread"><div><strong>Prepare video · MKV to MP4 or 4K enhancement</strong><p className="hint">Convert MKV to a compatible MP4 at its original resolution, or preview optional 4K enhancement. Processing is local and your original stays untouched.</p></div></div>
    <button className="btn btn-ghost" disabled={busy||running} onClick={()=>void act(async()=>{const selected=await studio.enhanceChoose();if(selected){pause();setJob(selected);setReviewed(false);}})}>{job?'Choose another movie':'Choose MKV or other movie'}</button>
    {job && <>
      <p className="asset-filename">{job.name}</p>
      <button className="btn btn-primary" disabled={busy||running} onClick={()=>void act(async()=>{pause();const result=await studio.convertFull(job.id);if(result){setReviewed(false);setJob(result);}})}>Convert to MP4 for upload…</button>
      <p className="hint">Uses the first video and audio tracks. Embedded subtitles and additional audio tracks are not included. Watch the saved MP4 before uploading.</p>
      <h4>Optional · enhance to 4K</h4>
      <div className="field-row"><div className="field"><label htmlFor="sample-start">Sample starts at (seconds)</label><input id="sample-start" type="number" min="0" max="86400" className="input" value={start} disabled={running||busy} onChange={e=>{setStart(e.target.value);setReviewed(false);setJob({...job,phase:'ready'});}} /></div>
      <div className="field"><label htmlFor="sample-length">Sample length</label><select id="sample-length" className="select" value={duration} disabled={running||busy} onChange={e=>{setDuration(Number(e.target.value));setReviewed(false);setJob({...job,phase:'ready'});}}><option value={10}>10 seconds · quicker preview</option><option value={30}>30 seconds · longer comparison</option></select></div></div>
      <button className="btn btn-primary" disabled={busy||running||!start.trim()} onClick={()=>void act(async()=>{pause();setReviewed(false);setJob(await studio.enhancePreview(job.id,Number(start),duration));})}>Generate before & after sample</button>
      {running && <div role="status"><p>{job.phase==='previewing'?'Preparing sample':'Processing full movie'} · {Math.round(job.progress*100)}%</p><progress max={1} value={job.progress}/><p className="hint">Keep Studio open. Full-movie processing can take time and needs free disk space.</p><button className="btn btn-ghost" onClick={()=>void act(async()=>{await studio.enhanceCancel(job.id);setJob(await studio.enhanceState(job.id));})}>Cancel processing</button></div>}
      {job.phase==='cancelled'&&<p role="status">Processing cancelled. The original is unchanged. Generate a new sample to continue.</p>}
      {job.beforeUrl&&job.afterUrl&&['review','processing','complete'].includes(job.phase)&&<>
        <div className="comparison-grid"><div><h4>Before · original sample</h4><video ref={before} src={job.beforeUrl} controls preload="metadata" onTimeUpdate={()=>{const a=before.current,b=after.current;if(a&&b&&!a.paused&&!b.paused&&Math.abs(a.currentTime-b.currentTime)>0.2)b.currentTime=a.currentTime;}} onEnded={pause}/></div><div><h4>After · enhanced 4K sample</h4><video ref={after} src={job.afterUrl} controls muted preload="metadata" onEnded={pause}/></div></div>
        <div className="btns"><button className="btn btn-ghost" onClick={()=>void play()}>Play both from start</button><button className="btn btn-ghost" onClick={pause}>Pause both</button></div>
        <p className="hint">Check faces, motion and dark scenes. Full-screen playback helps reveal softness and sharpening artifacts.</p>
        {job.phase==='review'&&<><label className="review-approval"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> I reviewed this sample and want these settings for the full movie.</label><button className="btn btn-primary" disabled={!reviewed||busy} onClick={()=>void act(async()=>{pause();const result=await studio.enhanceFull(job.id);if(result)setJob(result);})}>Approve & process full movie…</button></>}
      </>}
      {job.phase==='complete'&&<div role="status" className="enhancement-done"><strong>{job.operation==='convert'?'Compatible MP4 saved':'Enhanced movie saved'}</strong><p className="asset-filename">{job.output}</p><button className="btn btn-ghost" onClick={()=>void act(()=>studio.enhanceReveal(job.id))}>Show saved movie</button><p className="hint">Select this saved MP4 below, then use Save & upload files. Nothing is uploaded automatically.</p><FileButton accept="video/mp4" label="Select saved MP4 for upload" onFile={onFile}/></div>}
    </>}
    {(error||job?.error)&&<p role="alert" className="producer-error">{error||job?.error}</p>}
  </section>;
}
