import {mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
if(process.platform!=='darwin'){console.log('本机不是macOS，钥匙串保存不可用；不会落盘回退。');process.exit(0);}
const root=resolve(import.meta.dirname,'..'),dir=resolve(root,'.local/bin');await mkdir(dir,{recursive:true});
const compile=spawnSync('/usr/bin/clang',['-fobjc-arc','-Wno-deprecated-declarations','-framework','Foundation','-framework','Security','-framework','LocalAuthentication',resolve(root,'native/keychain.m'),'-o',resolve(dir,'jingwei-keychain')],{stdio:'inherit'});
if(compile.status!==0)process.exit(compile.status??1);
console.log('本机钥匙串程序已编译；未读取或保存凭据。');
