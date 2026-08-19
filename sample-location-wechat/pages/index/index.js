// @mini-dev/location 微信小程序示例（v1 方法级 API）
//
// 本示例演示库的全部特性，按分栏组织：
//   1. 基础使用        —— 平台包默认单例 + 原生参数原样透传 + ext 库控制
//   2. 内置拦截器      —— 缓存(maxAge) / 超时(timeout) / 取消(signal) / 重试(retry)
//   3. 自定义拦截器    —— 方法级默认拦截器 + 单次 ext.interceptors（koa 洋葱模型）
//   4. 回调模式        —— success/fail/complete，返回 undefined（与原生一致）
//   5. 权限闭环        —— permission 中间件：getSetting → authorize → blocked
//   6. 模糊定位        —— getFuzzyLocation（与精确在 requiredPrivateInfos 互斥）
//
// 库通过 `require` 消费（CJS），与微信「构建 npm」产物一致。
// 平台由独立包选定（@mini-dev/location-wx），不探测；import 不会抛错。
// 平台包再导出核心 API（createMethod / permission / LocationError）与平台单例，
// 消费方只装一个平台包即可；核心经平台包的 dependencies 传递引入。
const { getLocation, getFuzzyLocation, createMethod, permission, LocationError, createWxProvider } = require('@mini-dev/location-wx');

// ---- 共享演示状态 ----
let nativeCallCount = 0;   // 缓存演示：统计真正触达原生的次数
let retryAttempts = 0;     // 重试演示：统计 flaky 拦截器被命中的次数

// ---- 自定义拦截器（koa 洋葱模型：await next() 之前观察/改写入参，之后观察/改写响应）----
// 日志拦截器：演示洋葱模型的前/后切面（next 前后都能插逻辑）
const logInterceptor = async (ctx, next) => {
    console.log('→', ctx.method, 'nativeArgs=', ctx.nativeArgs);
    const t = Date.now();
    await next();
    console.log('←', ctx.method, '耗时', Date.now() - t, 'ms', 'result=', ctx.result);
};

// 计数拦截器：放在最靠近 core 的位置，只有真正下钻到原生时才会计数。
// 缓存命中时 cache 在它之前短路，故不会计数 —— 用它来"证明"缓存生效。
const countNativeInterceptor = async (ctx, next) => {
    nativeCallCount++;
    await next();
};

// 慢原生拦截器：模拟原生耗时，配合 timeout / abort 演示（原生调用本身无法取消，迟到的结果会被忽略）
const slowInterceptor = (ms) => async (ctx, next) => {
    await new Promise((r) => setTimeout(r, ms));
    await next();
};

// 模拟瞬态失败拦截器：前 failTimes 次抛"网络"错误（瞬态、可重试），之后放行。
// 抛普通 Error 且无 errMsg → provider.isTransientError 判为瞬态 → runWithRetry 会重跑整条链。
const flakyInterceptor = (failTimes) => async (ctx, next) => {
    retryAttempts++;
    if (retryAttempts <= failTimes) {
        throw new Error('getLocation:fail network error 模拟瞬态失败');
    }
    await next();
};

// 带权限闭环的方法实例：getSetting → authorize → blocked。
// onBlocked 把"是否弹窗 / 跳 openSetting"的 UX 交给 app（核心不耦合）。
const authedGetLocation = createMethod('getLocation', {
    provider: createWxProvider,
    interceptors: [
        permission({
            onBlocked: (e) => {
                wx.showModal({
                    title: '定位权限被拒绝',
                    content: `${e.code}：${e.message}`,
                    confirmText: '去设置',
                    success: (r) => { if (r.confirm) wx.openSetting(); }
                });
            }
        })
    ]
});

// 带"方法级默认拦截器"的方法实例（演示 createMethod 的 interceptors 形参）。
// 默认拦截器位于内置拦截器之后、单次 ext.interceptors 之前，每次调用都生效。
const loggedGetLocation = createMethod('getLocation', {
    provider: createWxProvider,
    interceptors: [logInterceptor]
});

// 专用方法实例（独享缓存），用于缓存演示：避免与默认单例共享缓存导致"串台"，
// 同时演示 createMethod 的 cacheSize 形参。
const cachedGetLocation = createMethod('getLocation', { provider: createWxProvider, cacheSize: 5 });

function formatError(e) {
    if (e instanceof LocationError) return `[${e.code}] ${e.message}`;
    const msg = (e && (e.errMsg || e.message || e.errorMessage)) || String(e);
    return msg;
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
    // 原生参数（type/altitude/isHighAccuracy）平铺、原样透传；库控制（timeout/maxAge/retry）放 ext。
    // 全省略 ext 即纯透传；这里组合了三个内置拦截器。
    async onTapGetLocation() {
        this.onLog('基础定位中…');
        try {
            const loc = await getLocation({
                type: 'gcj02',
                altitude: true,
                isHighAccuracy: true,
                ext: { timeout: 5000, maxAge: 3000, retry: 1 }
            });
            this.onLog(`getLocation: ${loc.latitude}, ${loc.longitude} (±${loc.accuracy}m)`);
        } catch (e) {
            this.onLog(`getLocation 失败: ${formatError(e)}`);
        }
    },

    // 纯透传：全省略 ext，整条链等价于直接调原生（库控制一行不写）。
    async onTapPure() {
        this.onLog('纯透传定位中（无 ext）…');
        try {
            const loc = await getLocation({ type: 'gcj02' });
            this.onLog(`纯透传: ${loc.latitude}, ${loc.longitude} (±${loc.accuracy}m)`);
        } catch (e) {
            this.onLog(`纯透传失败: ${formatError(e)}`);
        }
    },

    // ===== 2. 内置拦截器 =====
    // 缓存：ext.maxAge > 0 启用。连调两次（相同 nativeArgs），第二次命中缓存、不触达原生。
    // 用 countNativeInterceptor 计数"真正调原生"的次数来证明缓存生效。
    async onTapCache() {
        nativeCallCount = 0;
        this.onLog('缓存演示：连调两次相同参数…');
        try {
            const t1 = Date.now();
            const loc1 = await cachedGetLocation({
                type: 'gcj02',
                ext: { maxAge: 5000, interceptors: [countNativeInterceptor] }
            });
            const t2 = Date.now();
            const loc2 = await cachedGetLocation({
                type: 'gcj02',
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

    // 超时：ext.timeout > 0 启用 Promise.race 计时。模拟慢原生(2000ms) + timeout(500ms) → TIMEOUT。
    // 原生调用无法取消，迟到的 success 会被忽略。
    async onTapTimeout() {
        this.onLog('超时演示：模拟原生 2000ms，timeout 500ms…');
        try {
            await getLocation({
                type: 'gcj02',
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
            this.onLog('当前基础库不支持 AbortController，跳过取消演示');
            return;
        }
        this.onLog('取消演示：100ms 后 abort…');
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 100);
        try {
            await getLocation({
                type: 'gcj02',
                ext: { signal: controller.signal, interceptors: [slowInterceptor(2000)] }
            });
            this.onLog('取消演示：不应到达');
        } catch (e) {
            this.onLog(`取消演示: ${formatError(e)}`);
        }
    },

    // 重试：ext.retry > 0 仅对"瞬态"错误重试；库源错误（LocationError）一律终态不重试。
    // 模拟前 2 次瞬态失败、第 3 次成功，retry 3 次内恢复。
    async onTapRetry() {
        retryAttempts = 0;
        this.onLog('重试演示：模拟前 2 次瞬态失败，retry 3…');
        try {
            const loc = await getLocation({
                type: 'gcj02',
                ext: { retry: 3, interceptors: [flakyInterceptor(2)] }
            });
            this.onLog(`重试成功: ${loc.latitude}, ${loc.longitude}（共尝试 ${retryAttempts} 次）`);
        } catch (e) {
            this.onLog(`重试演示: ${formatError(e)}（共尝试 ${retryAttempts} 次）`);
        }
    },

    // ===== 3. 自定义拦截器 =====
    // 方法级默认拦截器：通过 createMethod 装入，每次调用都生效（此处为日志拦截器）。
    async onTapCustomInterceptor() {
        this.onLog('自定义拦截器演示：见 console（next 前后双切面）…');
        try {
            const loc = await loggedGetLocation({ type: 'gcj02', ext: {} });
            this.onLog(`自定义拦截器: ${loc.latitude}, ${loc.longitude}（日志见 console）`);
        } catch (e) {
            this.onLog(`自定义拦截器失败: ${formatError(e)}`);
        }
    },

    // 单次追加拦截器：ext.interceptors，只在本次调用生效，位于方法默认拦截器之后、core 之前。
    async onTapExtInterceptor() {
        this.onLog('单次追加拦截器（ext.interceptors）演示…');
        let ran = false;
        try {
            const loc = await getLocation({
                type: 'gcj02',
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
            this.onLog(`ext.interceptors ${ran ? '已运行' : '未运行'}: ${loc.latitude}, ${loc.longitude}`);
        } catch (e) {
            this.onLog(`ext.interceptors 失败: ${formatError(e)}`);
        }
    },

    // ===== 4. 回调模式 =====
    // 传 success/fail/complete 任一即进入回调模式，返回 undefined（与原生一致）；否则返回 Promise。
    onTapCallback() {
        this.onLog('回调模式：已发起，等待回调（调用返回 undefined）');
        const ret = getLocation({
            type: 'gcj02',
            success: (loc) => {
                this.onLog(`回调 success: ${loc.latitude}, ${loc.longitude}（调用返回 ${ret}）`);
            },
            fail: (e) => {
                this.onLog(`回调 fail: ${formatError(e)}（调用返回 ${ret}）`);
            },
            complete: () => {
                console.log('回调 complete');
            },
            ext: { timeout: 5000 }
        });
        // ret === undefined，与原生回调模式一致
    },

    // ===== 5. 权限闭环 =====
    // permission 中间件（可选，不进默认链）：getSetting → authorize → blocked。
    // authSetting[scope] === false 视为 blocked，抛 PERMISSION_BLOCKED 并回调 onBlocked。
    async onTapPermission() {
        this.onLog('带权限闭环的定位中…');
        try {
            const loc = await authedGetLocation({ type: 'gcj02', ext: {} });
            this.onLog(`permission + getLocation: ${loc.latitude}, ${loc.longitude}`);
        } catch (e) {
            this.onLog(`permission 链路: ${formatError(e)}`);
        }
    },

    // ===== 6. 模糊定位 =====
    // getFuzzyLocation 是隐私合规产物（独立 scope / 原生 API / 可单独撤销），与 getLocation 共享 createMethod 内部。
    // 注意：微信要求 getFuzzyLocation 与 getLocation/startLocationUpdate/onLocationChange 在
    // requiredPrivateInfos 里互斥，一个 app 只能二选一。本示例 app.json 声明了 getLocation，
    // 故实际调用会失败；如需演示模糊定位，把 app.json 的 requiredPrivateInfos 换成 ["getFuzzyLocation"]。
    async onTapFuzzy() {
        this.onLog('getFuzzyLocation：模糊定位（精度降级）。注意与精确在 requiredPrivateInfos 互斥。');
        try {
            const loc = await getFuzzyLocation({ ext: { timeout: 5000 } });
            this.onLog(`getFuzzyLocation: ${loc.latitude}, ${loc.longitude} (±${loc.accuracy}m)`);
        } catch (e) {
            this.onLog(`getFuzzyLocation 失败（预期，本示例未声明该 privateInfo）: ${formatError(e)}`);
        }
    }
});
