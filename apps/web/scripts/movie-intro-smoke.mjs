// Browser regression against the local Next dev server. All API traffic is intercepted.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const clip=await readFile(new URL('../../ios/CinneTemple/Resources/splash.mp4',import.meta.url));
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage();
  const errors=[];const beats=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('ct.access','fixture');localStorage.setItem('ct.refresh','fixture');});
  await page.route('http://localhost:4000/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let body;
    if(path==='/v1/auth/me')body={id:'fixture',email:'fixture@example.test',roles:[],profile:{displayName:'Fixture'}};
    else if(path.endsWith('/start'))body={titleId:'film',title:'Fixture Film',url:'http://localhost:4402/fixture-film.mp4',watermark:'fixture',durationSeconds:120,expiresAt:null,resumeSeconds:0};
    else if(path==='/v1/playback/continue')body=[];
    else if(path.endsWith('/progress')){beats.push(route.request().postDataJSON());body={};}
    else throw Error('Unexpected request '+path);
    await route.fulfill({json:body});
  });
  await page.route('**/fixture-film.mp4',route=>route.fulfill({status:200,contentType:'video/mp4',body:clip}));
  await page.goto('http://localhost:4402/watch?id=film');
  const film=page.locator('video[src*="fixture-film"]');
  await film.waitFor();
  await page.getByRole('button',{name:'Skip intro',exact:true}).waitFor();
  await page.waitForTimeout(300);
  assert.equal(await film.evaluate(v=>v.paused && v.currentTime===0),true);
  assert.equal(beats.length,0);
  await page.screenshot({path:'/tmp/cinnetemple-intro-web.png'});
  await page.getByRole('button',{name:'Skip intro',exact:true}).click();
  // Muted browser autoplay policies may require clicking the explicit Play control.
  await page.waitForTimeout(300);
  if(await film.evaluate(v=>v.paused))await page.getByRole('button',{name:'Play',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('video[src*="fixture-film"]').currentTime>0);
  assert.deepEqual(errors,[]);
  console.log('Web: movie remains paused during intro; no early heartbeat; skip hands off to movie');
} finally {await browser.close();}
