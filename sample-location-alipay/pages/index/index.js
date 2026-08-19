// @mini-dev/location 支付宝小程序示例（v1 方法级 API）
//
// 本示例演示库的全部特性，按分栏组织：
//   1. 基础使用        —— 平台包默认单例 + 原生参数原样透传 + ext 库控制
//   2. 内置拦截器      —— 缓存(maxAge) / 超时(timeout) / 取消(signal) / 重试(retry)
//   3. 自定义拦截器    —— 方法级默认拦截器 + 单次 ext.interceptors（koa 洋葱模型）
//   4. 回调模式        —— success/fail/complete，返回 undefined（与原生一致）
//   5. 权限闭环        —— permission 中间件：getSetting → authorize → blocked
//
// 平台由独立包选定（@mini-dev/location-my），不探测；import 不会抛错。
// 支付宝只有 getLocation（无 getFuzzyLocation / watchLocation），故 @mini-dev/location-my 仅导出 getLocation。
// 平台包再导出核心 API（createMethod / permission / LocationError），消费方只装一个平台包即可。
// 支付宝的 type 是「数据丰富度」（0=经纬度, 1=+省市区县, 2=+街道, 3=+POI），不是坐标系；
// 必须传 Number；坐标系支付宝不声明、不可选。
import { getLocation, createMethod, permission, LocationError, createMyProvider } from '@mini-dev/location-my';

// ---- 共享演示状态 ----
let nativeCallCount = 0;   // 缓存演示：统计真正触达原生的次数
let retryAttempts = 0;     // 重试演示：统计 flaky 拦截器被命中的次数

// ---- 自定义拦截器（koa 洋葱模型：await next() 之前观察/改写入参，之后观察/改写响应）----
const logInterceptor = async (ctx, next) => {
    console.log('→', ctx.method, 'nativeArgs=', ctx.nativeArgs);
    const t = Date.now();
    await next();
    console.log('←', ctx.method, '耗时', Date.now() - t, 'ms', 'result=', ctx.result);
};

// 计数拦截器：放在最靠近 core 的位置，只有真正下钻到原生时才会计数（缓存命中时不计）。
const countNativeInterceptor = async (ctx, next) => {
    nativeCallCount++;
    await next();
};

// 慢原生拦截器：模拟原生耗时，配合 timeout / abort 演示。
const slowInterceptor = (ms) => async (ctx, next) => {
    await new Promise((r) => setTimeout(r, ms));
    await next();
};

// 模拟瞬态失败拦截器：前 failTimes 次抛"网络"错误（瞬态、可重试），之后放行。
// 抛普通 Error 且无 error 码 → 支付宝策略 isTransientError 判为瞬态 → runWithRetry 会重跑整条链。
const flakyInterceptor = (failTimes) => async (ctx, next) => {
    retryAttempts++;
    if (retryAttempts <= failTimes) {
        throw new Error('getLocation:fail network error 模拟瞬态失败');
    }
    await next();
};

// 带权限闭环的方法实例：getSetting → authorize → blocked。
const authedGetLocation = createMethod('getLocation', {
    provider: createMyProvider,
    interceptors: [
        permission({
            onBlocked: (e) => {
                my.alert({
                    title: '定位权限被拒绝',
                    content: `${e.code}：${e.message}`,
                    buttonText: '我知道了'
                });
            }
        })
    ]
});

// 带"方法级默认拦截器"的方法实例（演示 createMethod 的 interceptors 形参）。
const loggedGetLocation = createMethod('getLocation', {
    provider: createMyProvider,
    interceptors: [logInterceptor]
});

// 专用方法实例（独享缓存），用于缓存演示：避免与默认单例共享缓存导致"串台"，
// 同时演示 createMethod 的 cacheSize 形参。
const cachedGetLocation = createMethod('getLocation', { provider: createMyProvider, cacheSize: 5 });

function formatError(e) {
    if (e instanceof LocationError) return `[${e.code}] ${e.message}`;
    const msg = (e && (e.errMsg || e.message || e.errorMessage)) || String(e);
    return msg;
}

function formatLoc(loc) {
    const acc = loc.accuracy == null ? '-' : loc.accuracy;
    return `${loc.latitude}, ${loc.longitude} (±${acc}m)`;
}

Page({
    data: {
        result: '点击下方按钮开始定位'
    },

    onLog(text) {
        console.log(text);
        this.setData({ result: text });
    },

    // ===== 1. 基础使用 =====
    // 支付宝 type 是数据丰富度（0=经纬度），原样透传、必须传 Number；库控制放 ext。
    async onTapGetLocation() {
        this.onLog('基础定位中…');
        try {
            const loc = await getLocation({
                type: 0,
                ext: { timeout: 5000, maxAge: 3000, retry: 1 }
            });
            this.onLog(`getLocation: ${formatLoc(loc)}`);
        } catch (e) {
            this.onLog(`getLocation 失败: ${formatError(e)}`);
        }
    },

    // 纯透传：全省略 ext，整条链等价于直接调原生。
    async onTapPure() {
        this.onLog('纯透传定位中（无 ext）…');
        try {
            const loc = await getLocation({ type: 0 });
            this.onLog(`纯透传: ${formatLoc(loc)}`);
        } catch (e) {
            this.onLog(`纯透传失败: ${formatError(e)}`);
        }
    },

    // ===== 2. 内置拦截器 =====
    // 缓存：ext.maxAge > 0 启用。连调两次（相同 nativeArgs），第二次命中缓存、不触达原生。
    async onTapCache() {
        nativeCallCount = 0;
        this.onLog('缓存演示：连调两次相同参数…');
        try {
            const t1 = Date.now();
            const loc1 = await cachedGetLocation({
                type: 0,
                ext: { maxAge: 5000, interceptors: [countNativeInterceptor] }
            });
            const t2 = Date.now();
            const loc2 = await cachedGetLocation({
                type: 0,
                ext: { maxAge: 5000, interceptors: [countNativeInterceptor] }
            });
            const t3 = Date.now();
            this.onLog(
                `缓存: 第1次 ${t2 - t1}ms / 第2次 ${t3 - t2}ms\n` +
                `原生调用次数=${nativeCallCount}（第2次命中缓存，未触达原生）\n` +
                `结果一致：(${loc1.latitude}, ${loc1.longitude}) === (${loc2.latitude}, ${loc2.longitude})`
            );
        } catch (e) {
            this.onLog(`缓存演示失败: ${formatError(e)}`);
        }
    },

    // 超时：ext.timeout > 0 启用。模拟慢原生(2000ms) + timeout(500ms) → TIMEOUT。
    async onTapTimeout() {
        this.onLog('超时演示：模拟原生 2000ms，timeout 500ms…');
        try {
            await getLocation({
                type: 0,
                ext: { timeout: 500, interceptors: [slowInterceptor(2000)] }
            });
            this.onLog('超时演示：不应到达');
        } catch (e) {
            this.onLog(`超时演示: ${formatError(e)}（迟到的原生结果被忽略）`);
        }
    },

    // 取消：ext.signal 触发即抛 CANCELLED。模拟慢原生 + 100ms 后 abort。
    async onTapAbort() {
        if (typeof AbortController === 'undefined') {
            this.onLog('当前环境不支持 AbortController，跳过取消演示');
            return;
        }
        this.onLog('取消演示：100ms 后 abort…');
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 100);
        try {
            await getLocation({
                type: 0,
                ext: { signal: controller.signal, interceptors: [slowInterceptor(2000)] }
            });
            this.onLog('取消演示：不应到达');
        } catch (e) {
            this.onLog(`取消演示: ${formatError(e)}`);
        }
    },

    // 重试：ext.retry > 0 仅对"瞬态"错误重试；库源错误（LocationError）一律终态不重试。
    async onTapRetry() {
        retryAttempts = 0;
        this.onLog('重试演示：模拟前 2 次瞬态失败，retry 3…');
        try {
            const loc = await getLocation({
                type: 0,
                ext: { retry: 3, interceptors: [flakyInterceptor(2)] }
            });
            this.onLog(`重试成功: ${formatLoc(loc)}（共尝试 ${retryAttempts} 次）`);
        } catch (e) {
            this.onLog(`重试演示: ${formatError(e)}（共尝试 ${retryAttempts} 次）`);
        }
    },

    // ===== 3. 自定义拦截器 =====
    async onTapCustomInterceptor() {
        this.onLog('自定义拦截器演示：见 console（next 前后双切面）…');
        try {
            const loc = await loggedGetLocation({ type: 0, ext: {} });
            this.onLog(`自定义拦截器: ${formatLoc(loc)}（日志见 console）`);
        } catch (e) {
            this.onLog(`自定义拦截器失败: ${formatError(e)}`);
        }
    },

    async onTapExtInterceptor() {
        this.onLog('单次追加拦截器（ext.interceptors）演示…');
        let ran = false;
        try {
            const loc = await getLocation({
                type: 0,
                ext: {
                    interceptors: [
                        async (ctx, next) => {
                            ran = true;
                            ctx.state.extNote = 'ext.interceptors 运行于方法默认拦截器之后、core 之前';
                            await next();
                        }
                    ]
                }
            });
            this.onLog(`ext.interceptors ${ran ? '已运行' : '未运行'}: ${formatLoc(loc)}`);
        } catch (e) {
            this.onLog(`ext.interceptors 失败: ${formatError(e)}`);
        }
    },

    // ===== 4. 回调模式 =====
    onTapCallback() {
        this.onLog('回调模式：已发起，等待回调（调用返回 undefined）');
        const ret = getLocation({
            type: 0,
            success: (loc) => {
                this.onLog(`回调 success: ${formatLoc(loc)}（调用返回 ${ret}）`);
            },
            fail: (e) => {
                this.onLog(`回调 fail: ${formatError(e)}（调用返回 ${ret}）`);
            },
            complete: () => {
                console.log('回调 complete');
            },
            ext: { timeout: 5000 }
        });
    },

    // ===== 5. 权限闭环 =====
    async onTapPermission() {
        this.onLog('带权限闭环的定位中…');
        try {
            const loc = await authedGetLocation({ type: 0, ext: {} });
            this.onLog(`permission + getLocation: ${formatLoc(loc)}`);
        } catch (e) {
            this.onLog(`permission 链路: ${formatError(e)}`);
        }
    }
});
