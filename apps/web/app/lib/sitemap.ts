// How the app is organised: four sections by what the reader is doing, each with its own pages,
// plus settings behind the gear. The header, the section tabs and the back links all read this.

export type Section = {key: string; label: string; to: string; paths: string[]; tabs?: {to: string; label: string}[]};

export const SECTIONS: Section[] = [
  {key: 'today', label: '今日判断', to: '/', paths: ['/', '/changes']},
  {key: 'mine', label: '我的', to: '/holdings', paths: ['/holdings', '/situation'],
    tabs: [{to: '/holdings', label: '持仓体检'}, {to: '/situation', label: '我的情况'}]},
  {key: 'research', label: '研究', to: '/compare', paths: ['/compare', '/topics', '/articles', '/saved'],
    tabs: [{to: '/compare', label: '费用比较'}, {to: '/topics', label: '专题'}, {to: '/articles', label: '文章'}, {to: '/saved', label: '收藏'}]},
  {key: 'bank', label: '机构服务', to: '/bank', paths: ['/bank', '/advisor'],
    tabs: [{to: '/bank', label: '规则卡'}, {to: '/advisor', label: '客户经理说明'}]},
];
export const SETTINGS = {to: '/settings', paths: ['/settings', '/maintenance']};

const within = (pathname: string, path: string) => path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);

export function sectionOf(pathname: string): Section | null {
  return SECTIONS.find(section => section.paths.some(path => within(pathname, path))) ?? null;
}

/** The tab a page belongs to inside its section (an article belongs to 文章). */
export function tabOf(section: Section, pathname: string) {
  return section.tabs?.find(tab => within(pathname, tab.to)) ?? null;
}

/**
 * Detail pages that sit one level below a section page get a back link to it. Top-level and tab
 * pages do not: the header and tabs already say where the reader is.
 */
export function backLink(pathname: string, search: string): {to: string; label: string} | null {
  const index = new URLSearchParams(search).get('index');
  if (pathname === '/changes') return {to: index ? `/?index=${index}` : '/', label: '今日判断'};
  if (pathname.startsWith('/articles/')) return {to: '/articles', label: '文章'};
  if (pathname.startsWith('/topics/')) return {to: '/topics', label: '专题'};
  if (pathname === '/settings/model' || pathname === '/maintenance') return {to: '/settings', label: '设置'};
  return null;
}
