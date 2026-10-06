const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('jingwei',{
 platform:process.platform,
 savePdf(){return ipcRenderer.invoke('reading:save-pdf');},
 readSituation(){const reply=ipcRenderer.sendSync('reading:read-situation');if(!reply?.ok)throw new Error('situation_read_failed');return reply.value;},
 writeSituation(value){const reply=ipcRenderer.sendSync('reading:write-situation',value);if(!reply?.ok)throw new Error('situation_write_failed');},
 readSaved(){const reply=ipcRenderer.sendSync('reading:read-saved');if(!reply?.ok)throw new Error('saved_read_failed');return reply.slugs;},
 writeSaved(slugs){const reply=ipcRenderer.sendSync('reading:write-saved',slugs);if(!reply?.ok)throw new Error('saved_write_failed');}
});
