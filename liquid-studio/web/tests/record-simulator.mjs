import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile), directory = fileURLToPath(new URL('../test-results/', import.meta.url));
const device = process.argv[2];
if (!device) throw new Error('Pass an iOS simulator UDID');
const start = Date.now();
const recorder = spawn('xcrun', ['simctl', 'io', device, 'recordVideo', '--codec=h264', '--force', `${directory}ios-process-raw.mp4`]);
const closed = new Promise(resolve => recorder.once('close', resolve));
recorder.stderr.on('data', data => process.stdout.write(data));
await new Promise(resolve => setTimeout(resolve, 700));
try {
  await exec('xcrun', ['simctl', 'openurl', device, `http://localhost:4174/__qa/?fixture=demo&record=${start}`]);
  const captured = new Set();
  while (Date.now() - start < 180_000) {
    const events = (await readFile(`${directory}events.jsonl`, 'utf8')).trim().split('\n').map(line => JSON.parse(line)).filter(e => e.runId === String(start) && /iPhone/.test(e.userAgent));
    for (const step of ['painted', 'confirmed', 'export-start', 'export-complete']) if (!captured.has(step) && events.some(e => e.step === step)) {
      await exec('xcrun', ['simctl', 'io', device, 'screenshot', `${directory}ios-${step}.png`]); captured.add(step); console.log(`Captured ${step}`);
    }
    if (events.some(e => e.step === 'failed')) throw new Error(events.find(e => e.step === 'failed').message);
    if (events.some(e => e.step === 'done')) break;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (!captured.has('export-complete')) throw new Error('Simulator export did not finish');
} finally {
  recorder.kill('SIGINT'); await closed;
}
console.log('Recorded actual Safari walkthrough and local export.');
