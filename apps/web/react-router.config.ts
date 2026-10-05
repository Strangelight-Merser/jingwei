import type { Config } from '@react-router/dev/config';
export default { ssr: true, appDirectory: 'app', buildDirectory: process.env.JINGWEI_WEB_BUILD_DIR??'build', routeDiscovery: { mode: 'initial' } } satisfies Config;
