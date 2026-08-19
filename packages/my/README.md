# @mini-dev/location-my

跨微信 / 支付宝 / 抖音小程序设备定位库的**支付宝（my）平台包**。

**只增强、不归一**——原生参数、结果、错误原样透传；只在原生方法外层套洋葱中间件，提供缓存 / 超时 / 重试 / 取消与自定义拦截器。增强下沉到**单个方法**，平台由消费方选平台包选定，不探测。

核心引擎见 [`@mini-dev/location`](https://www.npmjs.com/package/@mini-dev/location)（经传递依赖自动引入，无需手动装）。

## 特性

- **方法级增强**：`getLocation` 为自带拦截器链 + 缓存的可调用函数
- **原生零干涉**：参数 / 结果 / 错误原样透传，库不解释、不重写
- **库控制隔离**：库开关装在保留字段 `ext`，与原生参数命名空间分开
- **可插拔中间件**（[koa-compose](https://github.com/koajs/compose)）：内置缓存 / 超时 / 重试 / 取消，权限闭环为可选拦截器，支持自定义
- **Promise 优先、回调兼容**；支持 `AbortSignal`、超时、重试
- **TS 优先**

## 安装

```bash
npm i @mini-dev/location-my
```

> 支付宝按 IDE 的 npm 构建流程把 `@mini-dev/location-my` 及其传递依赖构建进 `miniprogram_npm`。

## 快速开始

从平台包导入现成单例（首次调用才绑定全局 `my`，import 不会抛错）：

```ts
import { getLocation } from '@mini-dev/location-my';

// 支付宝 type 为数据丰富度：0 经纬度 / 1 +省市区县 / 2 +街道 / 3 +POI（必须传 Number）
const loc = await getLocation({ type: 0, ext: { timeout: 5000 } });
console.log(loc.longitude, loc.latitude);   // 原生结果原样
```

原生参数（`type`）平铺在顶层原样透传，库控制（`timeout`）放进 `ext`。

## 调用约定

**调用选项 = 原生参数平铺 + 保留字段 `ext` + 原生回调**。

```ts
await getLocation({
    type: 0,                // ① 原生参数：和传给原生一模一样，原样透传
    cacheTimeout: 10000,
    success(r) { /* … */ },  // ② 原生回调：success / fail / complete
    ext: {                   // ③ 库控制：缓存 / 超时 / 重试 / 取消 / 单次拦截器
        timeout: 5000,
        maxAge: 3000,
        retry: 1
    }
});
```

- 库只剥固定 4 个键 `{ ext, success, fail, complete }`，**其余字段原样喂给原生**。
- **返回值与原生一致**：传了 `success` / `fail` / `complete` 任一 → 回调模式，返回 `undefined`；没传 → 返回 `Promise<原生响应>`。
- **全省略 `ext`** = 等价于直接调原生（纯透传）。

## 内置拦截器

始终挂在链上，各自按 `ext` 字段自激活（`>0` / `signal` 传入即生效），全省略 `ext` = 纯透传：

| `ext` 字段 | 触发 | 行为 |
|---|---|---|
| `timeout` | `>0` | 计时，超时抛 `TIMEOUT`；原生调用无法取消，迟到的结果被忽略 |
| `maxAge` | `>0` | 命中缓存短路、不调原生；键 = `method + 原生参数` |
| `retry` | `>0` | 仅对**瞬态**错误重试；库源 `LocationError` 属终态不重试 |
| `signal` | 传入 `AbortSignal` | 已 abort 或请求中 abort → 抛 `CANCELLED` |

```ts
// 5s 内重复同参调用，第二次命中缓存、不触达原生
await getLocation({ type: 0, ext: { maxAge: 5000 } });

// 网络抖动类瞬态错误最多重试 2 次
await getLocation({ type: 0, ext: { retry: 2 } });
```

链路顺序：`abort → cache → timeout → 方法默认 interceptors → ext.interceptors → core`，`retry` 在最外层包裹整条链。

> ⚠️ 缓存命中会在 `cache` 层短路，**其后的权限 / 自定义拦截器不会执行**。若权限必须每次校验，请**对该方法不启用 `maxAge`**，或为带权限校验的调用单独建一个不带缓存的 `createMethod` 实例。

> ⚠️ `AbortSignal` / `AbortController` 由消费方保证运行时可用。库不内置 polyfill。

## 权限闭环（可选拦截器）

`permission` 是可选中间件（不进默认链）。支付宝的定位授权多由 `getLocation` 首次调用时系统自动弹窗，`permission` 中间件在支付宝上主要用于「已拒绝后预判 blocked」。本包的 `permission` 已注入支付宝默认 scope（`location`）。

```ts
import { createMethod, permission, LocationError, createMyProvider } from '@mini-dev/location-my';

const authedGetLocation = createMethod('getLocation', {
    provider: createMyProvider,
    interceptors: [permission({ onBlocked: (e: LocationError) => showOpenSettingModal(e) })]
});

try {
    await authedGetLocation({ type: 0, ext: {} });
} catch (e) {
    if (e instanceof LocationError && e.code === 'PERMISSION_BLOCKED') showOpenSettingModal(e);
}
```

`authSetting[scope]` 三态：`true` 放行；`false` 视为 blocked；`undefined` 未问过，调 `authorize` 弹窗，失败抛 `PERMISSION_DENIED`。支付宝 scope 用短名 `location`（与 wx/tt 的 `scope.userLocation` 不同）；可通过 `opts.scope` 显式覆盖。不同平台权限交互差异较大，必要时以平台当前文档为准。

## 自定义拦截器

洋葱模型（koa-compose 风格），`await next()` 前后可观察 / 改写 `ctx`：

```ts
import { createMethod, createMyProvider } from '@mini-dev/location-my';

const loggedGetLocation = createMethod('getLocation', {
    provider: createMyProvider,
    interceptors: [
        async (ctx, next) => {
            console.log('→', ctx.method, ctx.nativeArgs);
            await next();
            console.log('←', (ctx.result as any)?.longitude);
        }
    ]
});
await loggedGetLocation({ type: 0, ext: {} });
```

两种挂载：**方法级默认** `createMethod({ interceptors })`（该实例所有调用生效）；**单次追加** `ext.interceptors`（仅本次，位于方法默认之后、`core` 之前）。

## 错误处理

- **库源错误**：收窄的 `LocationError`，`code` 是稳定判断依据——`TIMEOUT` · `CANCELLED` · `UNSUPPORTED` · `PERMISSION_DENIED` · `PERMISSION_BLOCKED`
- **原生错误**：**原样 reject**（支付宝 `{error, errorMessage}`），库不翻译、不合并、不打 `code`

```ts
try {
    await getLocation({ type: 0, ext: { timeout: 5000 } });
} catch (e) {
    if (e instanceof LocationError) {
        // 库源：按 e.code 分支
    } else {
        // 原生错误原样，e.error / e.errorMessage
    }
}
```

## API

### `getLocation(opts?)`
默认单例，等价 `createMethod('getLocation', { provider: createMyProvider })`。返回 `Promise<my.getLocation 结果>` 或回调模式下 `undefined`。

### `createMyProvider(): Provider`
构造 my Provider：首次调用懒绑全局 `my`，注入 my 的 `isTransientError`。

### `permission(opts?)`
权限中间件包装，注入支付宝默认 scope（`location`）。`opts`：`scope?`（显式覆盖默认）、`onBlocked?(e: LocationError)`。

### 再导出（来自 `@mini-dev/location`）
`createMethod` · `createProvider` · `LocationError` · 类型 `Provider` · `isTransientError`（my 瞬态策略）。

## 平台说明

- 支付宝 `getLocation` 无 `getFuzzyLocation`；本包不导出它。对不存在的方法 `createMethod('getFuzzyLocation', { provider: createMyProvider })` 首次调用会 reject `UNSUPPORTED`，**不静默降级**为精确。
- `type` 为数据丰富度（`0`~`3`，必须传 `Number`），坐标系不声明、不可选。
- 本包仅在支付宝环境使用，不防御 `my` 全局缺席（属 misuse）。

## 相关

- 仓库：<https://github.com/xesam/minidev-location>
- 核心引擎：[`@mini-dev/location`](https://www.npmjs.com/package/@mini-dev/location)
- 同族平台包：[`@mini-dev/location-wx`](https://www.npmjs.com/package/@mini-dev/location-wx) · [`@mini-dev/location-tt`](https://www.npmjs.com/package/@mini-dev/location-tt)

## License

ISC
