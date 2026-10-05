import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const api=spawn(process.execPath,['apps/api/src/main.ts'],{cwd:root,stdio:'inherit'});
const web=spawn('npm',['run','dev','-w','@jingwei/web'],{cwd:root,stdio:'inherit'});
function stop(){api.kill('SIGTERM');web.kill('SIGTERM');}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
api.on('exit',code=>{if(code)stop();});web.on('exit',()=>stop());
