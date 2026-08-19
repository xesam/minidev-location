# @mini-dev/location

跨微信 / 支付宝 / 抖音小程序的**设备定位库**。**只增强、不归一**——原生参数、结果、错误原样透传；只在原生方法外层套洋葱中间件，提供缓存 / 超时 / 重试 / 取消与自定义拦截器。增强下沉到**单个方法**，平台由独立平台包选定，不探测。

本仓库是 **monorepo**（pnpm workspace），拆为 4 个发布包：

- **`@mini-dev/location`** —— 平台无关核心引擎（`createMethod` / 中间件 / `LocationError` / 泛型 `createProvider`）
- **`@mini-dev/location-wx`** —— 微信平台包（wx Provider + 瞬态策略 + 默认单例）
- **`@mini-dev/location-my`** —— 支付宝平台包（my Provider + 瞬态策略 + 默认单例）
- **`@mini-dev/location-tt`** —— 抖音平台包（tt Provider + 瞬态策略 + 默认单例）

> 为什么要拆：**部分小程序平台的「构建 npm」不解析 `exports` 子路径**，`require('@mini-dev/location/wx')` 在这些平台会失败。拆成独立单入口包后，每个平台包只有 `main`，任何「构建 npm」都能解析。消费方只装一个平台包，核心经平台包的 `dependencies` 传递引入。

- **方法级增强**：每个方法是一个自带拦截器链 + 缓存的可调用函数
- **原生零干涉**：参数 / 结果 / 错误原样透传，库不解释、不重写
- **库控制隔离**：库开关装在保留字段 `ext`，与原生参数命名空间分开，未来原生新增参数也安全
- **平台独立包**：`@mini-dev/location-wx` / `-my` / `-tt` 各暴露现成单例 + 再导出核心 API，不探测平台
- **可插拔中间件**（[koa-compose](https://github.com/koajs/compose)）：内置缓存 / 超时 / 重试 / 取消，权限闭环为可选拦截器，支持自定义
- **Promise 优先、回调兼容**；支持 `AbortSignal`、超时、重试
- **TS 优先**，核心仅一个运行时依赖 `koa-compose`（普通依赖，自动安装）

---

## 1. 安装

按平台装一个平台包即可（核心经传递依赖自动引入）：

```bash
npm i @mini-dev/location-wx      # 微信
npm i @mini-dev/location-my      # 支付宝
npm i @mini-dev/location-tt      # 抖音
```

> **微信开发者工具**需额外执行 **工具 → 构建 npm**，把 `@mini-dev/location-wx` 及其传递依赖 `@mini-dev/location`、`koa-compose` 一起构建进 `miniprogram_npm`，否则运行时会报找不到 `koa-compose`。支付宝 / 抖音按各自 IDE 的 npm 构建流程即可。

## 2. 快速开始

从平台包导入现成单例（首次调用才绑定对应全局 `wx` / `my` / `tt`，import 不会抛错）：

```ts
import { getLocation } from '@mini-dev/location-wx';

const loc = await getLocation({ type: 'gcj02', ext: { timeout: 5000 } });
console.log(loc.latitude, loc.longitude, loc.accuracy);   // 原生结果原样
```

就这么简单：原生参数（`type`）平铺在顶层原样透传，库控制（`timeout`）放进 `ext`。

## 3. 调用约定

理解一条约定就能用对整个库：**调用选项 = 原生参数平铺 + 保留字段 `ext` + 原生回调**。

```ts
await getLocation({
    type: 'gcj02',        // ① 原生参数：和传给原生一模一样，原样透传
    altitude: true,
    isHighAccuracy: true,
    success(r) { /* … */ },   // ② 原生回调：success / fail / complete
    ext: {                 // ③ 库控制：缓存 / 超时 / 重试 / 取消 / 单次拦截器
        timeout: 5000,
        maxAge: 3000,
        retry: 1
    }
});
```

- 库只剥掉固定 4 个键 `{ ext, success, fail, complete }`，**其余字段原样喂给原生**——未来原生新增参数也不会与库控制撞名。
- **返回值与原生一致**：传了 `success` / `fail` / `complete` 任一 → 进入回调模式，返回 `undefined`；没传 → 返回 `Promise<原生响应>`。
- **全省略 `ext`** = 整条链等价于直接调原生（纯透传）。

## 4. 内置拦截器

四个内置拦截器始终挂在链上，**各自按 `ext` 字段自激活**：`>0`（`signal` 为传入即激活）才生效，全省略 `ext` 则整条链等价于纯透传。

| `ext` 字段 | 触发 | 行为 |
|---|---|---|
| `timeout` | `>0` | 计时，超时抛 `TIMEOUT`；原生调用无法取消，迟到的结果被忽略 |
| `maxAge` | `>0` | 命中缓存短路、不调原生；键 = `method + 原生参数`，存原生结果原样 |
| `retry` | `>0` | 仅对**瞬态**错误重试；库源错误（`LocationError`）属终态不重试 |
| `signal` | 传入 `AbortSignal` | 已 abort 或请求中 abort → 抛 `CANCELLED`；迟到结果被忽略 |

### 缓存（`maxAge`）

命中缓存直接短路、不调原生，键为 `method + 原生参数`；过期自动失效。

```ts
// 5s 内重复同参调用，第二次命中缓存、不触达原生
await getLocation({ type: 'gcj02', ext: { maxAge: 5000 } });
```

### 超时（`timeout`）

计时到点抛 `TIMEOUT`；原生调用无法取消，迟到的结果被忽略。

```ts
await getLocation({ type: 'gcj02', ext: { timeout: 5000 } });
```

### 重试（`retry`）

仅对**瞬态**错误重试（按平台策略判定瞬态 / 终态）；库源 `LocationError`（超时 / 取消 / 权限 / 不支持）属终态，不重试。

```ts
// 网络抖动类瞬态错误最多重试 2 次
await getLocation({ type: 'gcj02', ext: { retry: 2 } });
```

> 重试是包裹整条 compose 链的**外层 runner**（见 §12 设计）。每次重试会重跑整条链并清空 `ctx.result`，但**不会重置 `ctx.state`**——自定义拦截器若在 `await next()` 之前往 `ctx.state` 写入数据，需自行处理重试时的累积/残留（例如在 `next()` 之前重置自己的 state 键）。

### 取消（`signal`）

传入 `AbortSignal`，已 abort 或请求中 abort 即抛 `CANCELLED`；迟到结果被忽略。

```ts
const ac = new AbortController();
setTimeout(() => ac.abort(), 100);
await getLocation({ type: 'gcj02', ext: { signal: ac.signal } });
```

> ⚠️ `AbortSignal` / `AbortController` 由**消费方保证运行时可用**。部分小程序老引擎未原生提供，需自行 polyfill 或确认目标平台支持后再使用 `ext.signal`。库不内置 polyfill。

上述字段可任意组合：

```ts
const loc = await getLocation({
    type: 'gcj02', isHighAccuracy: true,
    ext: { timeout: 5000, maxAge: 3000, retry: 1 }
});
```

**链路顺序**：`abort → cache → timeout → 方法默认 interceptors → 单次 ext.interceptors → core`，`retry` 在最外层包裹整条链。

> ⚠️ 缓存命中会在 `cache` 层短路，**其后的自定义 / 权限拦截器不会执行**——这是设计取舍：缓存里存的是"已授权时取到的原生结果"，命中即返回旧值，不再触达原生、也不再重跑权限。含 `permission` 的方法若同时开 `maxAge`，命中缓存时权限检查会被跳过（含用户已撤销授权的窗口期，仍会返回旧位置）。若权限必须每次校验，请**对该方法不启用 `maxAge`**，或为"带权限校验的调用"单独建一个不带缓存的 `createMethod` 实例。

> **默认单例已内置** 缓存 / 超时 / 重试 / 取消（经 `ext` 激活），也支持单次 `ext.interceptors`——绝大多数场景无需 `createMethod`。只有需要 `permission` 权限闭环或**方法级**自定义拦截器（对该实例所有调用生效）时，才用 `createMethod` 自建实例；`permission` 不能直接挂到默认单例上。

## 5. 权限闭环（可选拦截器）

`permission` 是可选中间件（不进默认链）：`getSetting → 未授权则 authorize → blocked 抛错`。弹窗 / 跳设置页的 UX 交给调用方。平台包导出的 `permission` 已注入该平台的默认 scope。

```ts
import { createMethod, permission, LocationError, createWxProvider } from '@mini-dev/location-wx';

const authedGetLocation = createMethod('getLocation', {
    provider: createWxProvider,
    interceptors: [
        permission({
            onBlocked: (e: LocationError) => showOpenSettingModal(e)   // 由 app 实现弹窗 / 跳 wx.openSetting
        })
    ]
});

try {
    await authedGetLocation({ type: 'gcj02', ext: {} });
} catch (e) {
    if (e instanceof LocationError && e.code === 'PERMISSION_BLOCKED') showOpenSettingModal(e);
}
```

`authSetting[scope]` 三态：`true` 放行；`false` 视为 blocked（抛 `PERMISSION_BLOCKED` 并回调 `onBlocked`）；`undefined` 未问过，调 `authorize` 弹窗，失败抛 `PERMISSION_DENIED`。

**默认 scope 按平台分流**（平台包的 `permission` 包装在不传 `scope` 时选用）：wx / tt → `scope.userLocation` / `scope.userFuzzyLocation`；my（支付宝）→ `location`。支付宝的定位授权多由 `getLocation` 首次调用时系统自动弹窗，`permission` 中间件在支付宝上主要用于"已拒绝后预判 blocked"；不同平台权限交互差异较大，必要时通过 `opts.scope` 显式覆盖，以平台当前文档为准。

## 6. 自定义拦截器

洋葱模型（koa-compose 风格），`await next()` 前后可观察 / 改写 `ctx`：

```ts
import { createMethod, createWxProvider } from '@mini-dev/location-wx';

const loggedGetLocation = createMethod('getLocation', {
    provider: createWxProvider,
    interceptors: [
        async (ctx, next) => {
            console.log('→', ctx.method, ctx.nativeArgs);
            await next();
            console.log('←', (ctx.result as any)?.latitude);
        }
    ]
});
await loggedGetLocation({ type: 'gcj02', ext: {} });
```

两种挂载方式：

- **方法级默认**：`createMethod({ interceptors })`，对该实例所有调用生效。
- **单次追加**：`ext.interceptors`，仅本次调用生效，位于方法默认拦截器之后、`core` 之前。

拦截器可同时改入参（`ctx.nativeArgs`）与响应（`ctx.result`）。

## 7. 错误处理

库明确区分两类错误：

- **库源错误**：收窄的 `LocationError`，`code` 是稳定的判断依据——
  `TIMEOUT` · `CANCELLED` · `UNSUPPORTED` · `PERMISSION_DENIED` · `PERMISSION_BLOCKED`
- **原生错误**：**原样 reject**（微信 `{errMsg}`、支付宝 `{error, errorMessage}`），库不翻译、不合并、不打 `code`

```ts
try {
    await getLocation({ type: 'gcj02', ext: { timeout: 5000 } });
} catch (e) {
    if (e instanceof LocationError) {
        // 库源：按 e.code 分支（TIMEOUT / CANCELLED / …）
    } else {
        // 原生错误原样，e.errMsg 或 e.error
    }
}
```

## 8. 平台差异与平台包

平台由独立包选定，库不探测；各平台包暴露的能力即平台真实能力，无从误用：

| 平台包 | 导出 | `type` 语义 |
|---|---|---|
| `@mini-dev/location-wx` | `getLocation`、`getFuzzyLocation` | 坐标系 `'wgs84'`（默认）/ `'gcj02'` |
| `@mini-dev/location-my` | `getLocation` | **数据丰富度** `0` 经纬度 / `1` +省市区县 / `2` +街道 / `3` +POI，必须传 Number；坐标系不声明、不可选 |
| `@mini-dev/location-tt` | `getLocation` | 仅 `'gcj02'` |

> - 支付宝、抖音没有 `getFuzzyLocation`，故 `-my`、`-tt` 不导出它；对不存在的方法 `createMethod('getFuzzyLocation', { provider: createMyProvider })` 首次调用会 reject `UNSUPPORTED`，**不静默降级**为精确。
> - 微信要求 `getFuzzyLocation` 与 `getLocation` 在 `requiredPrivateInfos` 里互斥，一个 app 只能二选一。

## 9. API 参考

### `createMethod(name, options)`（核心 `@mini-dev/location`，由平台包再导出）

把一个原生方法包成可调用函数。

```ts
createMethod(name: 'getLocation' | 'getFuzzyLocation', {
    provider: () => Provider,          // 平台 Provider 工厂；首次调用懒调（保留 import 不抛语义）
    interceptors?: Interceptor[],     // 该实例的默认拦截器
    cacheSize?: number,                // 方法独享缓存容量，默认 3
    retryDelay?: (ms: number) => Promise<void>
}): (opts?: LocationOptions) => Promise<unknown> | undefined
```

`provider` 工厂由平台包提供（`createWxProvider` / `createMyProvider` / `createTtProvider`）：首次调用时懒绑本平台全局 `wx` / `my` / `tt`、注入本平台 `isTransientError`。`getLocation` 存在性由核心 `createProvider` 兜底校验。核心不碰任何平台全局、不探测平台、不在运行时携带平台标识。

### `createProvider(native, isTransientError?)`（核心，泛型）

```ts
createProvider(native: any, isTransientError?: (err: unknown) => boolean): Provider
```

把一个原生全局按方法名转发成 Provider；`isTransientError` 由调用方（平台包）注入。平台包用它构造自己的 Provider。

### `ExtControls`（`ext`）

`timeout` · `maxAge`（>0 启用缓存）· `retry` · `signal`（`AbortSignal`，触发即抛 `CANCELLED`）· `interceptors`（单次追加）。

### `Interceptor`

```ts
(ctx: LocationContext, next: () => Promise<void>) => Promise<void>
// ctx 关键字段：method / options / nativeArgs / ext / provider / result / state
```

### `permission(opts?)`（平台包导出）

平台包的 `permission` 已注入本平台默认 scope。`opts`：`scope?`（显式覆盖默认）、`onBlocked?(e: LocationError)`。
核心 `@mini-dev/location` 导出的 `permission` 则要求显式 `scopeFor: (method) => string`（平台无关，不含默认 scope）。

### `LocationError`

`code: LocationErrorCode` · `raw?: unknown`（原生错误原样附挂）。不携带 `platform` 字段——平台即所装平台包，无需运行时标签。

## 10. 示例工程

按平台各提供一份完整的小程序示例工程，可在对应开发者工具直接打开：

- 微信小程序：[sample-location-wechat](./sample-location-wechat/)
- 支付宝小程序：[sample-location-alipay](./sample-location-alipay/)
- 抖音小程序：[sample-location-douyin](./sample-location-douyin/)

示例是 monorepo workspace 成员，`package.json` 直接依赖三件：对应平台包（`@mini-dev/location-wx`/`-my`/`-tt`，`workspace:*`）、核心 `@mini-dev/location`（`workspace:*`）、`koa-compose`（`catalog:`）。原因：微信「构建 npm」只处理示例顶层 `node_modules` 里的包，不钻进 pnpm 嵌套 `node_modules` 找传递依赖，故三者都必须在示例顶层列出，才能一起构建进 `miniprogram_npm`（真实消费方用 npm 安装平台包时，核心与 `koa-compose` 会自动平铺到顶层，无需手动加）。开发流程：

```bash
pnpm install               # 安装并链接所有 workspace 包
pnpm build                 # 拓扑序构建核心 + 各平台包（产出 packages/*/dist）
```

随后在对应 sample 目录用小程序 IDE 打开，执行「构建 npm」。每个示例首页按分栏演示库的全部特性：

- **基础使用**：平台包导入 + 原生参数平铺透传 + `ext` 库控制；纯透传（全省略 `ext`）
- **内置拦截器**：缓存（`maxAge` 连调命中、统计原生调用次数）/ 超时（`TIMEOUT`）/ 取消（`AbortSignal` → `CANCELLED`）/ 重试（模拟瞬态失败、`retry` 恢复）
- **自定义拦截器**：方法级默认拦截器（洋葱前 / 后切面）+ 单次 `ext.interceptors` 追加
- **回调模式**：`success` / `fail` / `complete`，返回 `undefined`
- **权限闭环**：`permission` 中间件（`getSetting → authorize → blocked`）
- **模糊定位**（仅微信）：`getFuzzyLocation` 及其与 `getLocation` 的互斥说明

示例仅供 IDE 手动验证；`pnpm verify-samples` 用 mock 原生全局跑加载与 `getLocation` 成功 / 失败透传冒烟。

## 11. 开发与发布

```bash
pnpm test          # 拓扑序构建后，各包 jest --coverage（每包 100% 覆盖，阈值卡死 100）
pnpm run build     # pnpm -r 按拓扑序构建各包：rimraf dist && tsdown → dist/cjs + dist/esm
pnpm run typecheck # 各包 tsc --noEmit
```

每个包的发布产物布局（以 `@mini-dev/location-wx` 为例）：

- `dist/cjs/`：CommonJS（也作为微信「构建 npm」的 `miniprogram` 字段落点）
- `dist/esm/`：ES Module
- `dist/cjs/index.js` + `.d.ts`：单入口

两份产物均显式 `target: es2015`，对小程序老引擎友好。`koa-compose` 是核心 `@mini-dev/location` 的普通依赖（不内联打包）；平台包外置 `require('@mini-dev/location')`（同样不内联），消费方安装平台包即经传递依赖获得核心与 `koa-compose`，微信场景需一起「构建 npm」。构建时 cjs pass 在 `onSuccess` 把 `main` 与 `dependencies`（`workspace:*` 解析为实际版本）透传进 `dist/cjs/package.json`，保证包内跨包 require 在小程序运行时可用。

## 12. 设计

### 分层架构

```
消费方 ─► 平台包（@mini-dev/location-wx）─► createWxProvider()（懒绑 wx 全局 + 注入 wx isTransientError）
                                            │
                                            └─► createMethod(name, { provider })（核心，平台无关）
                                                  │  闭包持有：懒调 provider 工厂、方法独享缓存、默认拦截器、retryDelay
                                                  │
                                                  └─ 单次调用：构建洋葱链 abort → cache → timeout → 方法默认 interceptors → ext.interceptors → core
                                                                  │  retry 在 compose 链外层包裹整条链
                                                                  │
                                                                  └─ core ─► Provider ─► wx / my / tt 原生
                                                                            纯透传：原生入参原样进、原生结果原样出、原生错误原样 reject
```

- **平台包**：唯一知道平台的地方。构造本平台 Provider（直接引用 `wx`/`my`/`tt`、注入 `isTransientError`、定义 `defaultScope`），导出默认单例 + `permission` 包装 + 再导出核心 API。
- **createMethod**（核心）：把一个原生方法包成可调用函数；收 `Provider` 工厂，不归一化、不统一、不碰任何平台全局。
- **core**：链尾中间件，**统一用回调形式调原生**（规避微信 Promise 缺权限返 `undefined` 的坑），结果写 `ctx.result`、失败 `throw` 原生 err。

### 设计原则

- **增强，不归一**：不改变任何原生入参 / 响应 / 错误，只套洋葱中间件；平台差异由消费方选平台包暴露，库不探测。
- **方法级**：增强下沉到单个方法。每个方法是自带拦截器链 + 缓存的可调用函数；方法有无按平台分开暴露（`-wx`、`-my`、`-tt`），不在一个类里堆运行时才抛的方法。
- **核心平台无关**：核心 `createMethod` 收 `Provider` 工厂，types 不含 `Platform` 联合类型，不存 `TRANSIENT`、不存 `defaultScope`。平台耦合集中在 Provider 构造这一接缝，剥到平台包。
- **不探测平台**：消费方显式选平台包，平台包首次调用才懒绑 `wx`/`my`/`tt`。不猜、不在运行时携带平台标签；分平台包后不对「本平台全局缺席」设防——属 misuse。
- **原生参数零干涉**：调用形参 = 原生参数平铺 + 保留字段 `ext`，二者命名空间隔离；库只剥固定 4 个键，其余原样透传，未来原生新增参数也安全。
- **洋葱中间件**（[koa-compose](https://github.com/koajs/compose)）：缓存 / 超时 / 重试 / 取消都是可插拔中间件，按 `ext` 字段激活，全省略 = 纯透传。
- **TS 优先**，核心仅一个运行时依赖 `koa-compose`（普通 `dependencies`，不内联打包）。

### 几个关键 why

- **拆成独立平台包而非子路径**：部分小程序「构建 npm」不解析 `exports` 子路径，`require('@mini-dev/location/wx')` 在这些平台失败。每平台一包（仅 `main`）后，任何「构建 npm」都能解析；消费方只装一个平台包，核心经传递依赖引入。
- **`getFuzzyLocation` 不合并为开关**：fuzzy 是隐私合规产物，平台层面是独立能力（独立原生 API / 权限 scope / `app.json` 声明 / 可单独撤销）。合并成布尔开关会有"静默降级到精确 = 隐私回退"风险。两方法共享 `createMethod` 内部、零额外复杂度，仅对外多一个方法名，把隐私契约固化在 API 形状上更安全。
- **重试不在链内**：koa-compose 的 `next()` 只允许调用一次（内部有 index 守卫，再次调用会抛 `next() called multiple times`）。重试需重跑下游链，因此实现为 `runWithRetry` 外层 runner，而非 koa 中间件。
- **原生错误不归一**：旧版 `errorNormalize` 把所有原生 `errMsg` 映射成 `LocationError.code`（支付宝 `{error}` 被错读为 `UNKNOWN`，权限分支整体失效）。本版删除——原生错误原样 reject / 传给 `fail`，库不翻译、不合并、不打 `code`；库源动作（超时 / 取消 / 方法缺失 / 权限预判）才用收窄的 `LocationError`。
- **`koa-compose` 是普通依赖而非 peer**：微信开发者工具「构建 npm」运行时按包自身 `dependencies`（不含 `peerDependencies`）放行跨包 `require`。`koa-compose` 若是 peer，`@mini-dev/location` 内部 `require('koa-compose')` 会被拒。构建时 cjs pass 在 `onSuccess` 把 `main` 与 `dependencies` 透传进 `dist/cjs/package.json`，保证包内跨包 require 在小程序运行时可用。平台包同理透传 `@mini-dev/location`。

### 模块结构

```
packages/
  core/ (@mini-dev/location，平台无关)
    src/
      index.ts          公共导出（createMethod / createProvider / 类型 / LocationError / permission）
      method.ts         createMethod 工厂（懒调 provider、缓存、构建链、retry 外层、回调模式）
      types.ts          ExtControls / LocationContext / Interceptor / Provider / LocationErrorCode（无 Platform）
      errors.ts         LocationError（收窄 code）
      util.ts           promisify（原生 {success,fail} → Promise）/ stableKey（缓存键）
      providers/base.ts createProvider（泛型：绑定原生方法 + 注入 isTransientError）
      middleware/
        abort.ts cache.ts timeout.ts retry.ts
        permission.ts   可选权限中间件（scopeFor 注入，平台无关；非默认）
  wx/ (@mini-dev/location-wx)
    src/
      index.ts          createWxProvider + 默认单例（getLocation + getFuzzyLocation）+ permission 包装 + defaultScope + 再导出
      strategies.ts     wx isTransientError（errMsg 文本判定）
  my/ (@mini-dev/location-my)
    src/
      index.ts          createMyProvider + 默认单例（仅 getLocation）+ permission 包装（scope=location）
      strategies.ts     my isTransientError（error 数字码判定）
  tt/ (@mini-dev/location-tt)
    src/
      index.ts          createTtProvider + 默认单例（仅 getLocation）+ permission 包装
      strategies.ts     tt isTransientError（errMsg 文本判定，与 wx 同款）
```

构建：每包 tsdown 出 `dist/cjs` + `dist/esm` 双格式，单入口 `index`，各自带 `.d.ts` 与目录级 `package.json` type 标记；每个 pass 显式 `target: es2015`，对小程序老引擎友好。小程序「构建 npm」落点为各包 `package.json` 的 `miniprogram: "dist/cjs"`。`pnpm -r run build` 按拓扑序先核心后平台包（平台包 dts / 外置 require 依赖核心 dist）。

### 路线：统一作为 opt-in 拦截器

本版只增强、不归一。若后续需要跨平台统一坐标系字段（`coordinateSystem`）、统一错误 `code`、统一字段名等，**不回退到 core 归一化**，而是以 opt-in 拦截器叠加：拦截器可同时改入参（`ctx.nativeArgs`）与响应（`ctx.result`），按平台注入翻译逻辑。关掉即回纯透传，不污染增强基座。
