import { initializeStorage, readState, PRODUCTION_DATA_DIR } from '../packages/backend/storage.ts';
// Historical publishing/editing scripts are deliberately paused by default.
if(process.env.JINGWEI_ENABLE_MUTATIONS!=='true')throw new Error('content_mutations_paused');
await initializeStorage({dataDir:process.env.JINGWEI_DATA_DIR??PRODUCTION_DATA_DIR});
await readState(); // Missing data requires a separate, explicit initialization.
