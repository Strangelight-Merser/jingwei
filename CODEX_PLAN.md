# 经纬 · Codex 并行任务（2026-10-06）

截止：2026-10-08 24:00。Claude 与 Codex 在同一个 `jingwei/` 目录并行工作，**严格按文件分工，不改对方的文件**。每完成一项就单独 `git commit`（不 push），提交前运行 `npm run typecheck && npm test`，必须全绿。

## 背景：方向已经改了

判断不再固定为“无法评估/若有计划则维持”。现在由一条**公开规则**决定（提交 `8faeff6`）：

- 沪深300滚动市盈率在近10年中证官方数据里的分位：<30 偏低区（新增资金“可分批新增”）；30–70 中间区（“按原计划，不额外追加”）；70–90 偏高区（“暂缓新增”）；≥90 高位区（已有持仓“可按计划再平衡”）。连续5个数据日成立才改判。
- 规则：`packages/backend/valuation-rule.ts`；数据：`valuation-history.ts` + `csi300-pe-seed.ts`；接口：`GET /publication/judgment`。
- 当前：2026-09-30 PE 13.15，第48.8百分位，中间区；上次改判 2026-09-07（偏高区→中间区）；2016年以来回算共31次改判。
- 首页顶部 `RuleJudgment.tsx`，判断变化页 `RuleRecord.tsx`，我的情况 `SituationCard.tsx`。

先读这几个文件和 `git show 8faeff6 --stat`，再动手。

## 分工

**Claude 负责（Codex 不要改）**：`packages/backend/fund-research.ts`、`research-service.ts`、`judgment.ts`、`valuation-*.ts`、`packages/contracts/research.ts`、`desktop/main.mjs`、`apps/api/src/main.ts`、`tests/fund-research*.ts`、`tests/research-service.test.ts`、`tests/valuation-rule.test.ts`。内容：让 AI 研究链以规则结果为证据，模型立场必须与规则一致。

**Codex 负责**：下面任务 A–D 涉及的文件。

## 任务 A：精简首页下半部分（最优先）

文件：`apps/web/app/routes/home.tsx`（只改 `<SituationCard>` 之后的部分）、`components/ResearchBrief.tsx`、`components/CurrentChange.tsx`、`components/MarketFigure.tsx`、`app/front.css`。不要改 `RuleJudgment.tsx`、`SituationCard.tsx`、`judgment.css`。

1. 旧的“历史人工研究”大标题区块（“沪深300：估值倍数回落，临时追加先观察”）改成一行紧凑的“本期解读文章”入口：标题 + 日期 + 一句导读 + 链接。不再用 h1（页面的 h1 已是规则判断）。
2. `CurrentChange`（“本期改变”）和 `FreeResearchFacts`（“可用资料”那一大段）默认折叠到一个 `<details>`，摘要写“资料与口径（N 项）”。
3. 数值显示最多两位小数（现在有 `-6.1719%`）。在 `apps/web/app/lib/format.ts` 加格式化函数统一用。
4. 验收：桌面 1280px 与手机 375px 下，首页第一屏是规则判断，第二屏是我的情况，旧文章只占一行到三行。截图存 `evidence/rc5-home/`。

## 任务 B：README 与使用说明

文件：`README.md`。

- 第一段改为：经纬按公开估值规则给出沪深300的新增资金与持仓判断，判断随中证官方估值变化，每次改判可回看、可复算。
- 写清：规则内容、数据来源与区间（2011-06-28 起 3,788 个数据日）、回算与实际的区别、不预测涨跌不保证收益。
- 删除或更新已过时的 rc.1 发行描述；版本写为即将发布的 rc.5。
- 不夸大：31次改判是回算，不是当时发布的判断；AI 研究仍需用户自备 Key。

## 任务 C：参赛文书改叙事

文件：`docs/经纬_一页摘要.md`、`docs/经纬_参赛方案完整候选稿.md`、`docs/工行杯_新叙事提纲_当前实现.md`。

- 主线从“有依据的基金行动刊”改为“**按公开规则给出、会随证据改变、每次改判可复算的基金判断**”。
- 核心演示：首页判断 → 改判边界（12.42 / 14.24 / 15.33 倍）→ 2026-09-07 的真实改判 → 判断变化页的十年记录 → 我的情况给出对应说法。
- 免责声明集中到一个“边界”小节，正文不再逐句加限定。
- 数字全部从软件实际输出核对（`GET /publication/judgment`），不手写。

## 任务 D：发行 rc.5（等 Claude 通知 AI 链完成后再做）

文件：`package.json` 版本号、`electron-builder.yml`、`releases/`。

- 版本改为 `1.0.0-rc.5`；`npm run desktop:prepare && npm run desktop:mac`（Windows 交叉构建 `desktop:win`）。
- 用隔离数据目录验收：`JINGWEI_DESKTOP_DATA_DIR=<临时目录> npx electron .`。首页规则判断、判断变化页、我的情况三种情形（无计划无持有/有计划/已持有）逐一截图存 `evidence/rc5-acceptance/`。
- 不要覆盖用户的 `~/Applications/经纬.app`，不读取或修改任何密钥。

## 审查红线（Claude 会按这三条退回提交）

1. **不堆砌工程严密**：不新增 verification.json、manifest、过程记录、“引用核查”之类的证明文件；验收证据只要必要截图。评委看的是软件能做什么，不是我们做了多少检查。
2. **不用演示数据冒充真实**：界面和文书里的数字必须来自真实官方数据（中证估值、基金合同）。没有真实数据的功能就不展示，不用 fixture/模拟数据撑场面。
3. **不过分强调安全与哈希**：README 和参赛文书不写 SHA256 清单、加密/DPAPI/钥匙串细节、签名公证说明。密钥保护最多一句话。免责和未测项只在一个“边界”小节里各说一次，正文不逐句加限定。

## 约束

- 不 push、不发布、不提交比赛表单、不调用付费模型。
- 不删 `releases/` 里的旧发行包。
- 有冲突或拿不准时停下，写进本文件末尾的“问题”小节。

## 问题

任务 Q 验收（2026-10-06，基于 main / 6cd182f，版本 1.0.0-rc.5）：以下问题均在新 ZIP 解包的 Mac 应用与临时隔离数据目录中发现，未改功能代码。

1. **P1 · 客户说明打印闪退。** `/advisor` 能生成含计划、007339 持仓、期限及金额的完整说明，但点击“打印 / 另存 PDF”后应用退出，未能完成打印预览。进程退出码 139；系统报告 `/Users/huaiyi/Library/Logs/DiagnosticReports/经纬-2026-10-06-075801.ips` 为 `EXC_BAD_ACCESS / SIGSEGV`，主线程包含 `PJCSessionHasApplicationSetPrinter` 与 `-[NSPrintPanel runModalWithPrintInfo:]`。入口为 `apps/web/app/routes/advisor.tsx` 的 `window.print()`。根因尚未确定，需排查 Electron 与本机打印组件，修复后从这个按钮重验。
2. **P2 · 正常重开后阅读引导再次弹出。** 关闭引导后，同次运行返回首页不会再弹；正常退出（退出码 0）后，用同一隔离数据目录重开仍弹第一步。`ReadingGuide.tsx` 把关闭标记写入 `localStorage`，而 `desktop/main.mjs` 每次以端口 0 启动网页服务；本次正常重开从 `127.0.0.1:53214` 变为 `127.0.0.1:53532`，关闭标记未跨来源保留。需让关闭标记跨应用启动保留，再重验正常退出与重开。
3. **P2 · 鼠标松开曲线没有回到今天。** 拖动后大数字、日期与历史区间会改变；在曲线内松开鼠标后仍显示历史值（本次为 2022.10.26、第 18.5 百分位、PE 10.95），移出曲线后才恢复今天。`apps/web/app/components/HomeHero.tsx:97` 的 `onPointerUp` 只对非鼠标指针清空历史选择，与界面“松开回到今天”和任务 Q 要求不一致。需统一鼠标松开的行为或经确认修改交互说明。

任务 Z 验收（2026-10-06，基于 main / f9e57ec，版本仍为 1.0.0-rc.5）：上面任务 Q 的三项问题已在重新打包的 Mac ZIP 应用中复验通过；以下新问题只记录，未修改功能代码。

1. **P2 · 截图里已识别出的基金代码未参与匹配。** 显著标注“虚构持仓示例”的自制列表包含“易方达沪深300联接C 007339 / 30,000.00”和“华夏沪深300联接C 005658 / 20,000.00”。包内本机 OCR 返回第一行“易方达泸深300联接C 007339”，金额正确，但确认页显示“未匹配 / A股其他指数”；第二只正确匹配。`packages/backend/holdings.ts:36` 的 `ocrHoldingName` 删除了已正确识别的末尾代码，后续只能按误识别的名称匹配。确认页手工把“泸”改回“沪”、重新匹配后，两只都正确跟踪沪深300，保存和体检成功（总额 50,000 元、同向重复、规则覆盖 100%）。建议保留并利用 OCR 已读出的基金代码核对名称；本次不能判为两行均自动准确匹配。
2. **P3 · 持仓体检底部备注排成窄列。** 1260px 桌面窗口下，`evidence/rc5-acceptance/持仓体检.png` 中 C 类费用备注每行只有数个字。`apps/web/app/holdings.css:72` 的 `.holdings-list>ul>li` 同时命中了 `.holdings-notes li`，使备注继承四列网格（本次实测约 600px / 88px / 110px / 220px），文字落入 88px 窄列。建议收窄持仓条目选择器，或让备注项恢复普通块布局；本次未改样式。
