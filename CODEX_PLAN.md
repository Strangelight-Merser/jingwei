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

（Codex 在此记录）
