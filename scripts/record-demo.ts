/**
 * Records the product demo from the real app: a scripted walk through every section, captured frame by
 * frame with Chrome's screencast (2× pixels, so text stays sharp at 1080p). A visible cursor, click
 * ripples and captions are drawn inside the page. Frames and a manifest go to exports/submission/demo-frames/;
 * scripts/build-demo-video.py turns them into the MP4.
 * Run against a server without maintenance mode:  JINGWEI_DEMO_BASE=http://localhost:4440 node scripts/record-demo.ts
 */
import {mkdir, writeFile, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {homedir} from 'node:os';
import {readdirSync} from 'node:fs';

const playwright = process.env.JINGWEI_PLAYWRIGHT_MODULE ?? join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const {chromium} = await import(pathToFileURL(playwright).href);
const cache = join(homedir(), 'Library/Caches/ms-playwright');
const revision = readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort().at(-1)!;
const base = process.env.JINGWEI_DEMO_BASE ?? 'http://localhost:4440';
const out = resolve('exports/submission/demo-frames');
await rm(out, {recursive: true, force: true});
await mkdir(out, {recursive: true});

const W = 1440, H = 810;
const browser = await chromium.launch({headless: true, executablePath: join(cache, revision, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')});
const context = await browser.newContext({viewport: {width: W, height: H}, deviceScaleFactor: 2, locale: 'zh-CN'});

// Overlay drawn in every page: cursor, click ripple, caption, badge. State survives navigation via sessionStorage.
await context.addInitScript(() => {
  localStorage.setItem('jingwei.reader.first-run.done', '1');
  localStorage.setItem('jingwei.reader.reading-guide.dismissed', '1');
  if (window !== window.top) return; // embedded previews (the bank page's rule card) get no overlay
  const css = `
  #demo-cursor{position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,255,255,.95);border:2px solid #25252b;box-shadow:0 2px 10px rgba(0,0,0,.25);z-index:2147483647;pointer-events:none;transition:width .15s,height .15s,margin .15s}
  #demo-cursor.down{width:16px;height:16px;margin:-8px 0 0 -8px}
  .demo-ripple{position:fixed;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;border:2px solid #963749;z-index:2147483646;pointer-events:none;animation:demo-ripple .6s ease-out forwards}
  @keyframes demo-ripple{to{transform:scale(5);opacity:0}}
  #demo-caption{position:fixed;left:50%;bottom:34px;transform:translate(-50%,16px);opacity:0;z-index:2147483645;pointer-events:none;max-width:1100px;padding:14px 26px 15px;border-radius:16px;background:rgba(28,28,33,.92);color:#fff;box-shadow:0 12px 40px rgba(0,0,0,.22);font-family:-apple-system,'PingFang SC',sans-serif;transition:opacity .45s cubic-bezier(.2,.7,.2,1),transform .45s cubic-bezier(.2,.7,.2,1);text-align:center}
  #demo-caption.on{opacity:1;transform:translate(-50%,0)}
  #demo-caption b{display:block;font-size:13px;letter-spacing:.12em;color:#e3a4b0;font-weight:600;margin-bottom:4px}
  #demo-caption span{font-size:21px;line-height:1.45;font-weight:500;letter-spacing:.01em}
  #demo-badge{position:fixed;right:22px;top:76px;z-index:2147483645;pointer-events:none;padding:6px 14px;border-radius:999px;background:#963749;color:#fff;font:600 13px -apple-system,'PingFang SC',sans-serif;letter-spacing:.06em;box-shadow:0 4px 14px rgba(150,55,73,.35)}`;
  const mount = () => {
    if (document.getElementById('demo-cursor')) return;
    document.getElementById('demo-style')?.remove();
    const style = document.createElement('style'); style.id = 'demo-style'; style.textContent = css; document.head.appendChild(style);
    const cursor = document.createElement('div'); cursor.id = 'demo-cursor'; document.body.appendChild(cursor);
    const last = JSON.parse(sessionStorage.getItem('demo-pointer') ?? '[720,405]');
    cursor.style.transform = `translate(${last[0]}px,${last[1]}px)`;
    const caption = document.createElement('div'); caption.id = 'demo-caption'; document.body.appendChild(caption);
    document.addEventListener('mousemove', e => {cursor.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; sessionStorage.setItem('demo-pointer', JSON.stringify([e.clientX, e.clientY]));}, true);
    document.addEventListener('mousedown', e => {cursor.classList.add('down'); const r = document.createElement('div'); r.className = 'demo-ripple'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 700);}, true);
    document.addEventListener('mouseup', () => cursor.classList.remove('down'), true);
    const saved = sessionStorage.getItem('demo-caption');
    if (saved) {const [label, text] = JSON.parse(saved); caption.innerHTML = `<b>${label}</b><span>${text}</span>`; caption.classList.add('on');}
    if (sessionStorage.getItem('demo-badge')) {const badge = document.createElement('div'); badge.id = 'demo-badge'; badge.textContent = sessionStorage.getItem('demo-badge')!; document.body.appendChild(badge);}
  };
  if (location.hash === '#demo-fadein') {
    history.replaceState(null, '', location.pathname + location.search);
    const veil = () => {const v = document.createElement('div'); v.style.cssText = 'position:fixed;inset:0;background:#1f1f24;z-index:2147483647;transition:opacity .7s ease'; document.documentElement.appendChild(v); setTimeout(() => {v.style.opacity = '0'; setTimeout(() => v.remove(), 800);}, 250);};
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', veil); else veil();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  // React renders the whole document and can drop nodes added before hydration; put them back.
  setInterval(() => {if (document.body && !document.getElementById('demo-cursor')) mount();}, 120);
  (window as any).__demo = {
    caption(label: string, text: string) {
      mount();
      const c = document.getElementById('demo-caption')!; sessionStorage.setItem('demo-caption', JSON.stringify([label, text]));
      c.classList.remove('on'); setTimeout(() => {c.innerHTML = `<b>${label}</b><span>${text}</span>`; c.classList.add('on');}, c.innerHTML ? 260 : 0);
    },
    hide() {sessionStorage.removeItem('demo-caption'); document.getElementById('demo-caption')?.classList.remove('on');},
    badge(text: string | null) {
      mount();
      document.getElementById('demo-badge')?.remove();
      if (!text) {sessionStorage.removeItem('demo-badge'); return;}
      sessionStorage.setItem('demo-badge', text); const b = document.createElement('div'); b.id = 'demo-badge'; b.textContent = text; document.body.appendChild(b);
    },
  };
});

const page = await context.newPage();
const cdp = await context.newCDPSession(page);
type Frame = {file: string; t: number};
const frames: Frame[] = [];
const cuts: [number, number][] = [];
let n = 0;
cdp.on('Page.screencastFrame', async ({data, metadata, sessionId}: {data: string; metadata: {timestamp: number}; sessionId: number}) => {
  const file = `f${String(n++).padStart(6, '0')}.jpg`;
  frames.push({file, t: metadata.timestamp});
  void writeFile(join(out, file), Buffer.from(data, 'base64'));
  await cdp.send('Page.screencastFrameAck', {sessionId}).catch(() => {});
});
await cdp.send('Page.startScreencast', {format: 'jpeg', quality: 92, maxWidth: W * 2, maxHeight: H * 2, everyNthFrame: 1});

const now = () => Date.now() / 1000;
const wait = (ms: number) => page.waitForTimeout(ms);
let pointer = {x: 720, y: 405};
const ease = (t: number) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
async function move(x: number, y: number, ms = 700) {
  const from = {...pointer}, steps = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const k = ease(i / steps);
    await page.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k);
    await wait(ms / steps);
  }
  pointer = {x, y};
}
async function centre(locator: any) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}
async function click(locator: any, ms = 650) {
  const c = await centre(locator);
  await move(c.x, c.y, ms); await wait(120);
  await page.mouse.down(); await wait(90); await page.mouse.up();
}
const caption = (label: string, text: string) => page.evaluate(([l, t]: string[]) => (window as any).__demo.caption(l, t), [label, text]);
const hideCaption = () => page.evaluate(() => (window as any).__demo?.hide());
// Fade to the card colour before a hard change of page, so no half-painted frame is recorded.
const fadeOut = async (ms = 550) => {await page.evaluate((d: number) => {const v = document.createElement('div'); v.style.cssText = `position:fixed;inset:0;background:#1f1f24;opacity:0;z-index:2147483647;transition:opacity ${d}ms ease`; document.body.appendChild(v); requestAnimationFrame(() => v.style.opacity = '1');}, ms); await wait(ms + 80);};
async function go(path: string) {await hideCaption(); await page.goto(`${base}${path}`, {waitUntil: 'networkidle'});}
const badge = (text: string | null) => page.evaluate((t: string | null) => (window as any).__demo.badge(t), text);
async function scrollTo(y: number, ms = 1200) {
  await page.evaluate(([top]: number[]) => window.scrollTo({top, behavior: 'smooth'}), [y]); await wait(ms);
}
async function scrollToEl(selector: string, offset = 90, ms = 1300) {
  const top = await page.evaluate(([s, o]: [string, number]) => {const el = document.querySelector(s)!; return el.getBoundingClientRect().top + window.scrollY - o;}, [selector, offset]);
  await scrollTo(top, ms);
}
async function card(title: string, subtitle: string, line: string, ms: number) {
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;background:#1f1f24;font-family:-apple-system,'PingFang SC',sans-serif;color:#fff;overflow:hidden}
    .w{height:100%;display:grid;place-content:center;text-align:center}
    .mark{width:56px;height:56px;margin:0 auto 26px;opacity:0;animation:in .8s .1s forwards}
    h1{margin:0;font-size:64px;letter-spacing:.06em;font-weight:700;opacity:0;transform:translateY(14px);animation:up .9s .25s cubic-bezier(.2,.7,.2,1) forwards}
    h2{margin:18px 0 0;font-size:24px;font-weight:400;color:#c9c9d0;opacity:0;transform:translateY(14px);animation:up .9s .55s cubic-bezier(.2,.7,.2,1) forwards}
    p{margin:40px 0 0;font-size:17px;color:#e3a4b0;letter-spacing:.14em;opacity:0;animation:in .9s 1s forwards}
    @keyframes up{to{opacity:1;transform:none}} @keyframes in{to{opacity:1}}
    #demo-cursor{display:none}
  </style><div class="w"><svg class="mark" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" rx="8" fill="#fff"/><path d="M11 6v20M21 6v20M6 12h20M6 20h20" stroke="#c9c9d0" fill="none"/><path d="M6 21c3-5 5-6 7-3s4 4 6 1 4-6 7-7" stroke="#25252b" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="26" cy="12" r="2.4" fill="#963749"/></svg><h1>${title}</h1><h2>${subtitle}</h2><p>${line}</p></div>`);
  await wait(ms);
}

// ——— 1. Opening card
await card('经纬 · 规则e判', '基于公开估值规则与大模型解读的指数基金决策服务方案', '新钱怎么投 · 手里的怎么拿 · 什么时候会改判', 4200);

// ——— 2. Today's judgment
await page.goto(`${base}/?index=000300#demo-fadein`, {waitUntil: 'networkidle'}); await wait(1100);
await move(560, 330, 500);
await caption('今日判断', '新钱怎么投、手里的怎么拿，公开规则直接给出做法');
await wait(2600);
const chart = page.locator('.hero-chart').first();
const box = await chart.boundingBox();
await caption('十年估值位置', '拖动曲线，回看历史上每个交易日所处的估值分位');
await move(box.x + box.width * .95, box.y + box.height * .55, 800);
await page.mouse.down();
for (let i = 0; i <= 90; i++) {const k = .95 - .85 * ease(i / 90); await page.mouse.move(box.x + box.width * k, box.y + box.height * .55); pointer = {x: box.x + box.width * k, y: box.y + box.height * .55}; await wait(38);}
await wait(500);
for (let i = 0; i <= 50; i++) {const k = .10 + .45 * ease(i / 50); await page.mouse.move(box.x + box.width * k, box.y + box.height * .55); pointer = {x: box.x + box.width * k, y: box.y + box.height * .55}; await wait(34);}
await page.mouse.up(); await move(box.x + box.width * .5, box.y + box.height + 60, 500); await wait(1200);

// ——— 3. Eleven indices, sources, buffer
await caption('11 个指数', 'A股用中证指数官网日估值；境外与创业板用蛋卷基金周估值，并标明第三方');
await click(page.locator('.index-picker button', {hasText: '纳斯达克100'})); await wait(2200);
await click(page.locator('.index-picker button', {hasText: '恒生科技'})); await wait(2200);
await caption('缓冲与连续确认', '分位回落到 70 以下仍保持偏高区：越过缓冲并连续确认才改判，避免反复改口');
await click(page.locator('.index-picker button', {hasText: '中证1000'})); await wait(900);
const note = page.locator('.hero-buffer-note').first();
if (await note.count()) {const c = await centre(note); await move(c.x - 120, c.y, 900);}
await wait(3200);

// ——— 4. All indices
await caption('全部指数', '一屏看清每个指数在自己历史中的位置，以及新钱的做法');
await scrollToEl('.index-overview', 70, 1500); await wait(800);
const rows = page.locator('.index-overview li a');
for (const i of [0, 4, 7, 10]) {const c = await centre(rows.nth(i)); await move(c.x - 160, c.y, 550); await wait(350);}
await wait(1000);
await click(page.locator('.index-overview li a', {hasText: '沪深300'})); await wait(1600);

// ——— 5. Change history and what followed
await caption('改判记录', '十年里的每一次改判都按同一规则回测，可以用独立脚本逐条复算');
await click(page.locator('.hero-last a', {hasText: '次改判'})); await page.waitForLoadState('networkidle'); await wait(2200);
await caption('历史回放', '沪深300 处于偏低区后持有三年年化 9.6%，高位区 −5.1%（含分红，样本重叠，不代表未来）');
await scrollToEl('.rule-outcomes', 80, 1600); await wait(3600);
await caption('第二视角', '股债对照（ERP）只作参照，行动仍按公开的估值规则');
await scrollToEl('#erp-lens', 80, 1500); await wait(2800);
await caption('改判一览', '每次改判的日期、前后区间与当时的估值，按年整理');
await scrollToEl('.changes-log', 80, 1500); await wait(2400);

// ——— 6. Holdings check-up (fictional holdings)
await go('/holdings'); await wait(700);
await badge('虚构持仓示例');
await caption('持仓体检', '持仓截图或文字在本机识别，不上传；确认后再体检');
await click(page.getByRole('button', {name: '粘贴文字'})); await wait(500);
const box2 = page.getByRole('textbox', {name: '粘贴持仓名称与金额'});
await click(box2, 500);
for (const line of ['华夏沪深300ETF联接A 12000', '南方纳斯达克100指数(QDII)C 8000', '天弘恒生科技ETF联接C 6000', '易方达蓝筹精选混合 5000', '余额宝 3000']) {
  await page.keyboard.type(line, {delay: 22}); await page.keyboard.press('Enter');
}
await wait(500);
await click(page.getByRole('button', {name: '识别文字'})); await wait(1800);
await caption('核对识别结果', '名称自动匹配公开基金列表，可修改、删除或补充');
await wait(1600);
await click(page.getByRole('button', {name: '确认并保存'})); await page.waitForSelector('.holdings-report'); await wait(1500);
await caption('钱投向了哪里', '看清资金去向、规则覆盖与按区间汇总；主动和货币基金不套规则');
await wait(2600);
await scrollToEl('.holdings-list', 90, 1600);
await caption('逐只看', '每只指数基金对应所跟踪指数的判断，可导出一页体检报告');
await wait(3000);
const exportButton = page.getByRole('button', {name: '导出体检报告'});
await scrollTo(0, 900); await move((await centre(exportButton)).x, (await centre(exportButton)).y, 700); await wait(1200);
await badge(null);

// ——— 7. Ask Jingwei (one real answer; the wait for the model is cut from the video)
await go('/?index=000300'); await wait(500);
await scrollToEl('.ask-jingwei', 90, 1400);
await caption('问经纬', '规则负责判断，大模型负责解释；回答须与规则立场一致并通过数字、来源校验');
await wait(1200);
await click(page.locator('.ask-suggestions button', {hasText: '什么情况下会改判'})); await wait(700);
const submit = page.locator('.ask-actions button[type=submit]');
await click(submit); await page.waitForFunction(() => {const b = document.querySelector('.ask-actions button[type=submit]') as HTMLButtonElement | null; return b && !b.disabled;}, null, {timeout: 30000}); await wait(800);
await click(submit, 400); await wait(900);
const cutFrom = now();
await page.waitForSelector('.ask-answer', {timeout: 90000});
cuts.push([cutFrom, now() - .6]);
await wait(600);
await scrollToEl('.ask-jingwei', 80, 1200); await wait(2200);
await hideCaption(); await wait(4200); // let the whole answer be read

// ——— 8. Bank channel
await go('/bank'); await wait(1200);
await caption('机构服务', '同一条规则做成规则卡，可嵌入工银手机银行页面，也提供 JSON 与客户经理一页说明');
await wait(2600);
const select = page.locator('.bank-preview select');
await move((await centre(select)).x, (await centre(select)).y, 700);
for (const code of ['NDX', 'HSTECH', '000300']) {await select.selectOption(code); await wait(1900);}
await click(page.locator('.bank-copy'), 800); await wait(1600);
await hideCaption(); await wait(500); await fadeOut(700);

// ——— 9. Closing card
await card('经纬 · 规则e判', '让每次判断讲得清，让每次改变有依据', '财富管理服务 · 11 个指数 · 规则判别 + 大模型解读', 4600);

await cdp.send('Page.stopScreencast');
await wait(300);
await writeFile(join(out, 'manifest.json'), JSON.stringify({frames, cuts, size: [W * 2, H * 2]}, null, 1));
await browser.close();
console.log(`${frames.length} frames, ${(frames.at(-1)!.t - frames[0].t).toFixed(1)} s recorded, ${cuts.length} cut(s)`);
