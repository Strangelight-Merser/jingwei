const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('jingwei',{
 platform:process.platform,
 readSaved(){const reply=ipcRenderer.sendSync('reading:read-saved');if(!reply?.ok)throw new Error('saved_read_failed');return reply.slugs;},
 writeSaved(slugs){const reply=ipcRenderer.sendSync('reading:write-saved',slugs);if(!reply?.ok)throw new Error('saved_write_failed');}
});
