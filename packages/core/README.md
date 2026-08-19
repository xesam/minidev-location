# @mini-dev/location

跨微信 / 支付宝 / 抖音小程序的**设备定位核心引擎**（平台无关）。

**只增强、不归一**——原生参数、结果、错误原样透传；只在原生方法外层套洋葱中间件，提供缓存 / 超时 / 重试 / 取消与自定义拦截器。增强下沉到**单个方法**，核心不碰任何平台全局、不探测平台。

> 大多数消费方不需要直接装本包，而是按平台装一个平台包（核心经传递依赖自动引入）：
> - `@mini-dev/location-wx` —— 微信
> - `@mini-dev/location-my` —— 支付宝
> - `@mini-dev/location-tt` —— 抖音
>
> 本包面向「自建 Provider / 自定义平台 / 方法级定制」的进阶场景。

唯一运行时依赖：[koa-compose](https://github.com/koajs/compose)。

## 安装

```bash
npm i @mini-dev/location
```

## 导出

```ts
// 引擎
export { createMethod } from '@mini-dev/location';
export type { AugmentedMethod, CreateMethodOptions } from '@mini-dev/location';

// 自建 Provider
export { createProvider } from '@mini-dev/location';
export type { Provider } from '@mini-dev/location';

// 权限中间件（平台无关，需显式 scopeFor）
export { permission } from '@mini-dev/location';
export type { PermissionInterceptorOptions } from '@mini-dev/location';

// 错误
export { LocationError } from '@mini-dev/location';
export type { LocationErrorCode } from '@mini-dev/location';

// 控制与上下文类型
export type { ExtControls, Interceptor, LocationContext, LocationOptions } from '@mini-dev/location';
```

## API

### `createMethod(name, options)`

把一个原生方法包成可调用函数。

```ts
createMethod(name: 'getLocation' | 'getFuzzyLocation', {
    provider: () => Provider,          // Provider 工厂；首次调用懒调（保留 import 不抛语义）
    interceptors?: Interceptor[],       // 该实例的默认拦截器
    cacheSize?: number,                 // 方法独享缓存容量，默认 3
    retryDelay?: (ms: number) => Promise<void>
}): (opts?: LocationOptions) => Promise<unknown> | undefined
```

`provider` 工厂由平台包提供（`createWxProvider` / `createMyProvider` / `createTtProvider`），或用下方 `createProvider` 自建。核心不碰任何平台全局、不探测平台、不在运行时携带平台标识。

### `createProvider(native, isTransientError?)`

```ts
createProvider(native: any, isTransientError?: (err: unknown) => boolean): Provider
```

把一个原生全局按方法名转发成 Provider；`isTransientError` 由调用方注入，用于重试时判定瞬态 / 终态。方法不存在时首次调用 reject `UNSUPPORTED`，**不静默降级**。

### `permission(opts)`（平台无关）

核心版 `permission` 需显式 `scopeFor`（核心不含任何平台默认 scope）：

```ts
permission({ scopeFor: (method: 'getLocation' | 'getFuzzyLocation') => string, onBlocked?: (e: LocationError) => void })
```

`authSetting[scope]` 三态：`true` 放行；`false` 视为 blocked（抛 `PERMISSION_BLOCKED` 并回调 `onBlocked`）；`undefined` 未问过，调 `authorize` 弹窗，失败抛 `PERMISSION_DENIED`。弹窗 / 跳设置页的 UX 交给调用方。平台包导出的 `permission` 已注入该平台默认 scope，消费方一般用平台包版本。

### `ExtControls`（`ext`）

调用选项 = 原生参数平铺 + 保留字段 `ext` + 原生回调。库只剥固定 4 个键 `{ ext, success, fail, complete }`，其余原样喂给原生。

`ext`：`timeout` · `maxAge`（>0 启用缓存）· `retry` · `signal`（`AbortSignal`，触发即抛 `CANCELLED`）· `interceptors`（单次追加）。

### `Interceptor`

```ts
(ctx: LocationContext, next: () => Promise<void>) => Promise<void>
// ctx 关键字段：method / options / nativeArgs / ext / provider / result / state
```

### `LocationError`

`code: LocationErrorCode`（`TIMEOUT` · `CANCELLED` · `UNSUPPORTED` · `PERMISSION_DENIED` · `PERMISSION_BLOCKED`）· `raw?: unknown`（原生错误原样附挂）。库源动作用 `LocationError`；**原生错误原样 reject，库不翻译、不合并、不打 code**。

## 内置拦截器

始终挂在链上，各自按 `ext` 字段自激活（`>0` / `signal` 传入即生效），全省略 `ext` = 纯透传：

| `ext` 字段 | 触发 | 行为 |
|---|---|---|
| `timeout` | `>0` | 计时，超时抛 `TIMEOUT`；原生调用无法取消，迟到的结果被忽略 |
| `maxAge` | `>0` | 命中缓存短路、不调原生；键 = `method + 原生参数` |
| `retry` | `>0` | 仅对**瞬态**错误重试；库源 `LocationError` 属终态不重试 |
| `signal` | 传入 `AbortSignal` | 已 abort 或请求中 abort → 抛 `CANCELLED` |

链路顺序：`abort → cache → timeout → 方法默认 interceptors → ext.interceptors → core`，`retry` 在最外层包裹整条链。

> 重试是包裹整条 compose 链的外层 runner（koa-compose 的 `next()` 只能调一次，无法在链内循环重试）。每次重试重跑整条链并清空 `ctx.result`，但**不会重置 `ctx.state`**——自定义拦截器若在 `await next()` 前写 `ctx.state`，需自行处理重试时的累积 / 残留。

## 自建平台 / Provider 示例

```ts
import { createMethod, createProvider, LocationError } from '@mini-dev/location';

// 假设某新平台全局为 foo，原生方法为 foo.getLocation
declare const foo: any;
function isTransientError(err: unknown) { /* 按平台判定瞬态错误 */ return false; }

const createFooProvider = () => createProvider(foo, isTransientError);
export const getLocation = createMethod('getLocation', { provider: createFooProvider });

const loc = await getLocation({ /* 原生参数 */ , ext: { timeout: 5000, retry: 1 } });
```

## 相关

- 仓库：<https://github.com/xesam/minidev-location>
- 平台包：[`@mini-dev/location-wx`](https://www.npmjs.com/package/@mini-dev/location-wx) · [`@mini-dev/location-my`](https://www.npmjs.com/package/@mini-dev/location-my) · [`@mini-dev/location-tt`](https://www.npmjs.com/package/@mini-dev/location-tt)

## License

ISC
