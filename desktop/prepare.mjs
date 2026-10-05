import {cp,mkdir,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'.desktop-build/web');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
const pointer=JSON.parse(await readFile(path.join(root,'apps/web/.builds/current.json'),'utf8'));
await cp(path.join(root,'apps/web',pointer.build_dir),out,{recursive:true});
