# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@mini-dev/location` —— 跨微信 / 支付宝 / 抖音小程序的设备定位库（TS）。**只增强、不归一**：给原生方法套洋葱中间件（缓存 / 超时 / 重试 / 取消），原生入参 / 响应 / 错误原样透传；平台差异由消费方选**独立平台包**暴露，库不探测。`koa-compose`（普通依赖，不内联打包）提供洋葱中间件。设计说明见 `README.md` §12 设计。

本仓库是 **pnpm workspace monorepo**，拆 4 个发布包：

- `packages/core` —— `@mini-dev/location`：平台无关核心引擎（`createMethod` / 中间件 / `LocationError` / 泛型 `createProvider`）。不碰 `globalThis`、不存 `Platform` 联合类型 / `TRANSIENT` / `defaultScope`。
- `packages/wx` —— `@mini-dev/location-wx`：wx Provider + wx 瞬态策略 + 默认单例（getLocation + getFuzzyLocation）+ `permission` 包装。
- `packages/my` —— `@mini-dev/location-my`：my Provider + my 瞬态策略 + 默认单例（仅 getLocation）+ `permission` 包装（scope=`location`）。
- `packages/tt` —— `@mini-dev/location-tt`：tt Provider + tt 瞬态策略 + 默认单例（仅 getLocation）+ `permission` 包装。

**为什么拆**：部分小程序「构建 npm」不解析 `exports` 子路径，`require('@mini-dev/location/wx')` 在这些平台失败。拆成独立单入口包（仅 `main`）后任何「构建 npm」都能解析；消费方只装一个平台包，核心经平台包 `dependencies` 传递引入。

## Commands

- **测试：** `pnpm test` = 拓扑序构建后各包 `jest --coverage`。每包核心 100% 覆盖（statements/branches/functions/lines），覆盖率阈值卡死 100，低于则失败。平台包测试依赖核心已构建（`pnpm test` 会先 `pnpm -r build`）。
- **类型检查：** `pnpm run typecheck`（先 `pnpm --filter @mini-dev/location run build` 产出核心 dist，再各包 `tsc --noEmit`）。平台包 tsconfig 无 `paths`，`@mini-dev/location` 经 node_modules 软链解析到核心**已构建的 dist 类型**——故必须先构建核心。
- **构建：** `pnpm run build`（`pnpm -r --filter './packages/**' run build`，按拓扑序先核心后平台包；每包 `rimraf dist && tsdown` → `dist/cjs` + `dist/esm`，双格式 + per-format `.d.ts`，显式 `target: es2015`）。配置见各包 `tsdown.config.ts`；小程序「构建 npm」落点为各包 `package.json` 的 `miniprogram: "dist/cjs"`。
- **单测单个文件：** 在某包目录下 `npx jest test/method.test.ts`（平台包需先 `pnpm --filter @mini-dev/location build` 产出核心 dist）。
- **冒烟：** `pnpm verify-samples`（先 build，再用 mock 原生全局跑示例加载与 getLocation 成功 / 失败透传）。

## Architecture

方法级、不归一、不探测（见 README.md §12 设计）：

```
平台包 createXxxProvider() ── 直接引用本平台全局 wx/my/tt + 注入本平台 isTransientError（getLocation 存在性由核心 createProvider 兜底校验）
   │
   └─► 核心 createMethod(name, { provider: () => Provider }) ── 增强方法（闭包：懒调 provider 工厂 + 方法独享缓存 + 默认拦截器 + retryDelay）
          └─ 单次调用：compose([abort?, cache?, timeout?, ...方法interceptors, ...ext.interceptors, core])
                          └─ runWithRetry 包裹整条链（在 compose 外层）
   core ─► Provider(adapter) ─► wx/my/tt 原生
        纯透传：原生入参原样进、原生结果原样出、原生错误原样 reject
```

- **`createMethod`（`packages/core/src/method.ts`）**：把一个原生方法包成可调用函数。**入参 `{ provider: () => Provider, interceptors?, cacheSize?, retryDelay? }`**——`provider` 是工厂，首次调用懒调（保留「import 不抛」语义），工厂由平台包提供，核心不再碰 `globalThis`、不再 `createProvider(native, platform)`。按调用构建链；`ext` 字段激活内置拦截器；retry 在外层包裹；回调模式（`success`/`fail`/`complete`）返回 `undefined`，否则返回 `Promise<原生响应>`。provider 工厂抛错时调用 reject 该错误，且 provider 未缓存、下次调用重试工厂。
- **调用形态**：单对象 = 原生参数平铺 + 保留字段 `ext`（`timeout`/`maxAge`/`retry`/`signal`/`interceptors`）。`core` 只剥固定 4 键 `{ext, success, fail, complete}`，其余原样给原生。**不要平铺库控制到顶层**——会和原生参数撞名（旧版 `type` 冲突 bug 的教训）。
- **`core`**（`method.ts` 内）**用回调形式调原生**（`promisify`）——规避微信 Promise 缺权限返 `undefined` 的坑；结果写 `ctx.result`，失败 `throw` 原生 err。方法在 Provider 上不存在时抛 `UNSUPPORTED`，**不静默降级**（fuzzy 不回退精确）。
- **重试不是 koa 中间件**，而是 `runWithRetry` 外层 runner：koa-compose 的 `next()` 只能调用一次，无法在链内循环重试。`err instanceof LocationError` → 终态不重试；否则按 `provider.isTransientError(err)` 判定瞬态。
- **链路顺序**：`abort → cache → timeout → 方法默认 interceptors → ext.interceptors → core`，retry 在最外层包裹。内置拦截器按 `ext` 激活：`ext.maxAge>0` 才缓存、`ext.timeout>0` 才计时、`ext.retry>0` 才重试、`ext.signal` 才取消；全省略 = 纯透传。
- **`providers/base.ts`**（核心，泛型）：`createProvider(native, isTransientError?)` 绑定原生方法 + 注入调用方传入的 `isTransientError`。Provider 不携带 `platform` 字段——平台即平台包本身，核心不在运行时携带任何平台标识。
- **平台包**：唯一知道平台的地方。`createXxxProvider` 直接引用本平台全局（`wx`/`my`/`tt`）、注入本平台 `isTransientError`（`packages/{wx,my,tt}/src/strategies.ts`）、定义本平台 `defaultScope`；导出默认单例 + `permission` 包装（在核心 `permission` 上注入 `scopeFor`）+ 再导出核心 `createMethod`/`createProvider`/`LocationError`/类型。**无 `detect.ts`**——不探测，平台由消费方选平台包；分平台包后「运行时不存在」不设防，平台全局缺席属 misuse。
- `permission.ts`（核心）：可选中间件（非默认），`permission({ scopeFor, onBlocked })`——`scopeFor: (method) => string` 必填（核心平台无关，无默认 scope）。`authSetting[scope] === false` 视为 blocked。弹窗/`openSetting` UX 交给调用方。平台包的 `permission({ scope?, onBlocked })` 包装用本平台 `defaultScope` 填 `scopeFor`。通过 `createMethod({ interceptors: [permission(...)] })` 装入。

## Conventions

- 公开 API 收敛在 `packages/core/src/index.ts`：导出 `createMethod` / `createProvider` / `LocationError` / `permission` + 公开类型（`ExtControls`/`LocationContext`/`LocationOptions`/`Interceptor`/`Provider`/`LocationErrorCode`/`AugmentedMethod`/`CreateMethodOptions`）。**不导出** `Platform`/`TRANSIENT`/`isTransientError`/平台单例/`LocationCache`/`compose`。内部实现（`LocationCache` 等）不公开，测试直接从 `packages/core/src/...` 路径导入。
- 改公开 API 不需考虑向后兼容（v1）；但 `packages/core/test/index.test.ts` 里有"不导出内部细节"的断言，收敛后要同步。各平台包 `test/index.test.ts` 同样有导出面断言。
- 4 空格缩进、单引号、分号。无 prettier 依赖。
- 加新中间件：放 `packages/core/src/middleware/`，在 `method.ts` 的链路数组按位置挂入；写对应 `packages/core/test/<name>.test.ts` 并保持 100% 覆盖。
- 改 per-platform 重试判定：改对应 `packages/{wx,my,tt}/src/strategies.ts`，同步该包 `test/strategies.test.ts`。
- 加新平台包：新建 `packages/<plat>/`（`src/index.ts` + `src/strategies.ts` + `package.json`/`tsconfig.json`/`tsdown.config.ts`/`jest.config.js` + `test/`），在 `pnpm-workspace.yaml` 的 `packages/*` 通配下自动纳入；按平台能力决定是否导出 `getFuzzyLocation`。同步 `tsconfig.json` 根 paths（如需）+ 新增对应 sample。
- 示例 `sample-location-*` 的 `package.json` 必须直接依赖**三件**：对应平台包（`workspace:*`）+ `@mini-dev/location`（`workspace:*`）+ `koa-compose`（`catalog:`）。原因：微信「构建 npm」只处理示例顶层 `node_modules` 里的包，不钻进 pnpm 嵌套 `node_modules` 找传递依赖；缺任何一个都不会被构建进 `miniprogram_npm`，运行时 `require` 回退相对路径而失败。`pnpm verify-samples` 里的 `checkSampleDeps` 是这条约定的防回归 guard。真实消费方（非 monorepo）用 npm 装平台包时，核心与 `koa-compose` 会自动平铺到顶层，无需手动加。
- 跨包类型解析：**根 `tsconfig.json`** 用 `paths` 把 `@mini-dev/location` 映射到 `packages/core/src`（IDE 跨包导航用，不参与脚本化构建）。各包 `tsconfig.json` **无 `paths`**，`tsc`/tsdown/jest 一律经 node_modules 软链解析到核心**已构建的 dist**——故 `pnpm test`/`typecheck`/平台包 build 需先构建核心，拓扑序由 pnpm `-r` 保证（`test`/`typecheck` 脚本已显式先 build 核心）。
- `workspace:*` 协议在发布时由 pnpm 改写为实际版本；各包 tsdown cjs pass 的 `onSuccess`（`scripts/build-deps.cjs` 的 `resolveDeps`）把 `workspace:*` 解析为已安装实际版本的 caret 区间写入 `dist/cjs/package.json`，让小程序「构建 npm」运行时跨包 require 可用。
