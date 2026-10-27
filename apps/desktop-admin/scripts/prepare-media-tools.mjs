import {mkdir,stat,chmod,rename,rm,writeFile} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {createGunzip} from 'node:zlib';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile);
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Pinned upstream binaries and their license/source notices (ffmpeg-static 5.3.0 release).
const base='https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1';
const targets=process.argv.slice(2);if(!targets.length)targets.push(`${process.platform}-${process.arch}`);
await Promise.all(targets.map(async target=>{
 if(!['darwin-arm64','darwin-x64','win32-x64'].includes(target))throw Error('Unsupported target');
 const dir=path.join(root,'build/media-tools',target);await mkdir(dir,{recursive:true});
 const binary=path.join(dir,target.startsWith('win32')?'ffmpeg.exe':'ffmpeg');
 const download=async(url,out)=>exec('curl',['--fail','--location','--retry','3','--max-time','900','--silent','--show-error',url,'-o',out],{maxBuffer:1024*1024});
 if(!(await stat(binary).catch(()=>null))){
  await download(`${base}/ffmpeg-${target}.gz`,binary+'.gz');
  await pipeline(createReadStream(binary+'.gz'),createGunzip(),createWriteStream(binary+'.tmp'));
  await chmod(binary+'.tmp',0o755);await rename(binary+'.tmp',binary);await rm(binary+'.gz');
 }
 await download(`${base}/${target}.LICENSE`,path.join(dir,'FFmpeg.LICENSE'));
 await download(`${base}/${target}.README`,path.join(dir,'FFmpeg.README'));
 await download('https://raw.githubusercontent.com/FFmpeg/FFmpeg/n6.0/COPYING.GPLv3',path.join(dir,'COPYING.GPLv3.txt'));
 await download('https://raw.githubusercontent.com/FFmpeg/FFmpeg/n6.0/COPYING.LGPLv2.1',path.join(dir,'COPYING.LGPLv2.1.txt'));
 await writeFile(path.join(dir,'SOURCE.txt'),`FFmpeg distributed as a separate executable. Build/source details: ${base}/${target}.README\nBinary release: https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1\nFFmpeg source: https://ffmpeg.org/download.html\n`);
 console.log(`Ready: ${target}`);
}));
