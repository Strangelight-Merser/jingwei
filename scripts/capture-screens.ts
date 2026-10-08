/** Task BA: node scripts/capture-screens.ts. Uses bundled Playwright; no server restart. */
import {mkdir, writeFile, readdir} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {homedir} from 'node:os';
const modulePath = process.env.JINGWEI_PLAYWRIGHT_MODULE ?? join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const {chromium} = await import(pathToFileURL(modulePath).href);
const cache = join(homedir(), 'Library/Caches/ms-playwright');
const revision = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort().at(-1)!;
const browser = await chromium.launch({headless: true, executablePath: process.env.JINGWEI_CHROMIUM ?? join(cache, revision, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')});
const out = resolve('exports/submission/assets/screens');
await mkdir(out, {recursive: true});
const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 2, locale: 'zh-CN'});
const page = await context.newPage();
const entries: string[] = [];
const base = 'http://localhost:4410';
async function ready() {await page.waitForLoadState('networkidle'); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1000);}
async function go(path: string) {await page.goto(base + path); await ready();}
async function tag() {await page.evaluate(() => {if(document.getElementById('synthetic-label'))return; const label=document.createElement('div');label.id='synthetic-label';label.textContent='虚构持仓示例';label.style.cssText='position:fixed;top:12px;right:18px;z-index:99999;background:#963749;color:white;padding:7px 12px;border-radius:5px;font:14px "PingFang SC",sans-serif;print-color-adjust:exact';document.body.append(label);});}
async function shot(name: string, description: string, fullPage = false) {await ready(); await page.screenshot({path:join(out,name+'.png'),fullPage});entries.push(`${name}.png — ${description}`);console.log(name);}
async function focus(selector: string) {await page.locator(selector).first().evaluate((element: Element)=>element.scrollIntoView({block:'start',behavior:'instant'}));await page.evaluate(()=>window.scrollBy({top:-160,behavior:'instant'}));await page.waitForTimeout(500);}
try {
 await go('/'); await page.getByRole('button',{name:'跳过',exact:true}).click();
 if(await page.getByRole('button',{name:'关闭阅读引导'}).isVisible()) await page.getByRole('button',{name:'关闭阅读引导'}).click();
 await shot('01_首页沪深300','桌面今日判断，当前规则与改判边界');
 await focus('#index-overview-title'); await shot('02_首页全部指数一览','11 个指数的实际判断一览');
 await go('/?index=NDX'); await shot('03_首页纳斯达克100','纳斯达克100及蛋卷第三方周数据说明');
 await go('/?index=000852'); await shot('04_首页中证1000','中证1000实际分位与缓冲保留判断');
 await go('/changes?index=000300'); await shot('05_判断变化沪深300','沪深300历史曲线、改判次数及回算说明');
 await focus('#rule-outcomes'); await ready(); await page.locator('#rule-outcomes').locator('..').screenshot({path:join(out,'06_判断变化收益回放与ERP.png'),style:'.masthead{visibility:hidden}'});entries.push('06_判断变化收益回放与ERP.png — 实际收益回放与ERP完整区域（局部截图）');
 await go('/holdings'); await page.getByRole('button',{name:'粘贴文字',exact:true}).click();
 await page.locator('#holdings-text').fill('华夏沪深300ETF联接A 12000\n南方纳斯达克100指数(QDII)C 8000\n天弘恒生科技ETF联接C 6000\n富国中证红利指数增强A 4000\n易方达蓝筹精选混合 5000\n余额宝 3000');
 await page.getByRole('button',{name:'识别文字',exact:true}).click(); await page.getByRole('button',{name:'确认并保存',exact:true}).waitFor(); await tag();
 await shot('07_持仓导入','虚构持仓文字导入后的六只基金确认表',true);
 await page.getByRole('button',{name:'确认并保存',exact:true}).click(); await page.locator('.holdings-report').waitFor(); await tag();
 await shot('08_持仓体检结果','虚构持仓的规则覆盖、区间汇总与逐只判断',true);
 await page.emulateMedia({media:'print'}); await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));await tag();
 await shot('09_体检报告导出页','实际打印样式预览，虚构持仓示例',true);
 await page.emulateMedia({media:'screen'});await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
 await go('/situation'); await shot('10_我的情况','本机情况选择与金额输入');
 await go('/compare'); await shot('11_费用比较','基金费用比较与来源',true);
 await go('/bank'); await shot('12_机构服务规则卡','实际规则卡预览与嵌入入口',true);
 await go('/advisor');await page.getByRole('button',{name:'生成一页说明',exact:true}).click();await shot('13_客户经理说明','默认客户情况生成的一页说明',true);
 const fresh = await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2,locale:'zh-CN'}); const intro=await fresh.newPage();await intro.goto(base);await intro.getByRole('button',{name:'开始',exact:true}).click();await intro.getByRole('button',{name:'下一步',exact:true}).waitFor();await intro.waitForTimeout(2000);await intro.screenshot({path:join(out,'14_首次引导第二步.png')});entries.push('14_首次引导第二步.png — 全新上下文首次引导的11指数数据准备页');await fresh.close();
 await go('/?index=HSTECH');await focus('.ask-jingwei');await shot('15_问经纬展开状态','恒生科技问经纬建议问题与输入区，未提交提问');
 await page.setViewportSize({width:390,height:844});await go('/');await shot('16_手机首页','390×844 首页与底部标签栏');
 await go('/holdings');await page.locator('.holdings-report').waitFor();await tag();await shot('17_手机持仓体检','手机虚构持仓体检首屏');
 await writeFile(join(out,'README.md'),entries.join('\n')+'\n');
} finally {await context.close();await browser.close();}
