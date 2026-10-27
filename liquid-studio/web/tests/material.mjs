import { _electron as electron } from '../../desktop/node_modules/playwright/index.mjs';
import executablePath from '../../desktop/node_modules/electron/index.js';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { command, binaries } from '../../desktop/main/media.js';

const root=fileURLToPath(new URL('../',import.meta.url)),results=root+'test-results/';
await mkdir(results+'reference-study',{recursive:true});
await command(binaries().ffmpeg,['-v','error','-y','-f','lavfi','-i',"testsrc2=size=320x180:rate=30:duration=1.6,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(t,0.8,0.89)'",'-itsoffset','0.2','-f','lavfi','-i',"aevalsrc=0.5*sin(2*PI*1000*t)*between(t\\,0.6\\,0.69):s=48000:d=1.4",'-c:v','libx264','-crf','12','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k',results+'sync-input.mp4'],{stdout:'ignore'}).done;
const server=spawn(process.execPath,[root+'scripts/serve.mjs'],{env:{...process.env,LIQUID_QA:'1',PORT:'0'}});
let app;
try{
  const url=await new Promise((resolve,reject)=>{
    server.stdout.on('data',chunk=>{const match=/http:\/\/localhost:\d+/.exec(String(chunk));if(match)resolve(match[0]);});
    server.once('error',reject);server.once('exit',code=>reject(new Error('Server exited '+code)));
  });
  const runId='material-'+Date.now();
  app=await electron.launch({executablePath,args:[root+'tests/browser-host.cjs'],env:{...process.env,LIQUID_TEST_URL:`${url}/__qa/?fixture=material&record=${runId}`}});
  const page=await app.firstWindow(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.waitForFunction(()=>document.documentElement.dataset.qaDone,null,{timeout:120000});
  const events=(await readFile(results+'events.jsonl','utf8')).trim().split('\n').map(line=>JSON.parse(line)).filter(event=>event.runId===runId);
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.qaDone),'true',JSON.stringify(events));
  assert.deepEqual(errors,[]);
  await page.screenshot({path:results+'reference-study/application-desktop.png'});
  await writeFile(results+'browser-material-environment.json',JSON.stringify({environment:'Electron / Chromium desktop',physicalDevice:false,events},null,2));
  const verification=await promisify(execFile)(process.execPath,[root+'tests/verify.mjs','browser-material']);
  console.log(verification.stdout);
  console.log('Area gestures, guided navigation, actual PNG, shared MP4 rendering and decoded playback passed.');
}finally{await app?.close();server.kill();}
