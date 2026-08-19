import { LocationError } from './errors';
import compose from 'koa-compose';
import { LocationCache, createCacheInterceptor } from './middleware/cache';
import { createTimeoutInterceptor } from './middleware/timeout';
import { createAbortInterceptor } from './middleware/abort';
import { defaultDelay, runWithRetry } from './middleware/retry';
import { promisify } from './util';
import type {
    ExtControls,
    Interceptor,
    LocationContext,
    LocationOptions,
    Provider
} from './types';

/** 库保留键：剥掉这 4 个，其余原样作为原生参数透传。 */
const LIB_KEYS = new Set(['ext', 'success', 'fail', 'complete']);

export interface CreateMethodOptions {
    /**
     * Provider 工厂，首次调用时懒调以绑定平台原生全局。
     * 由平台库提供（如 @mini-dev/location-wx 的 createWxProvider）；核心不碰 globalThis、
     * 不构造 Provider。工厂抛出的错误（如 UNSUPPORTED）会原样透给调用方的 reject / fail。
     */
    provider: () => Provider;
    /** 该方法实例的默认拦截器（链中位于内置拦截器之后、单次拦截器之前）。 */
    interceptors?: Interceptor[];
    /** 该方法独享的缓存容量，默认 3。 */
    cacheSize?: number;
    /** 可注入的重试退避函数，便于测试。默认基于 setTimeout。 */
    retryDelay?: (ms: number) => Promise<void>;
}

/** 增强后的方法：原生参数平铺 + ext 保留字段 + 原生回调。 */
export type AugmentedMethod = (opts?: LocationOptions) => Promise<unknown> | undefined;

/**
 * 把一个原生方法（getLocation/getFuzzyLocation）包成一个增强方法实例：
 * 自带拦截器链（abort/cache/timeout/用户/单次/core）+ 独享缓存 + retry 外层。
 * 原生参数与响应原样透传；库控制走 ext；回调模式与原生一致（返回 undefined）。
 *
 * 平台绑定由 `opts.provider` 工厂承担：首次调用时调用它拿到 Provider 并缓存，
 * 失败（工厂抛错）则下次调用重试。核心本身平台无关。
 */
export function createMethod(name: 'getLocation' | 'getFuzzyLocation', opts: CreateMethodOptions): AugmentedMethod {
    const { provider: providerFactory, interceptors = [], cacheSize = 3, retryDelay = defaultDelay } = opts;
    let provider: Provider | null = null;
    const cache = new LocationCache(cacheSize);

    function ensureProvider(): Provider {
        if (provider) return provider;
        // 工厂抛错时 provider 保持 null，下次调用会重试工厂（与旧版懒绑语义一致）。
        provider = providerFactory();
        return provider;
    }

    return function method(callOpts: LocationOptions = {}): Promise<unknown> | undefined {
        const ext: ExtControls = callOpts.ext ?? {};
        const nativeArgs: Record<string, unknown> = {};
        for (const k in callOpts) {
            if (!LIB_KEYS.has(k)) nativeArgs[k] = callOpts[k];
        }
        const success = callOpts.success as ((r: unknown) => void) | undefined;
        const fail = callOpts.fail as ((e: unknown) => void) | undefined;
        const complete = callOpts.complete as ((r: unknown) => void) | undefined;
        const hasCallback = !!success || !!fail || !!complete;

        const run = async (): Promise<unknown> => {
            const p = ensureProvider();
            const ctx: LocationContext = {
                method: name,
                options: callOpts,
                nativeArgs,
                ext,
                provider: p,
                result: undefined,
                state: {}
            };
            const chain: Interceptor[] = [
                createAbortInterceptor(),
                createCacheInterceptor({ cache }),
                createTimeoutInterceptor(),
                ...interceptors,
                ...(ext.interceptors ?? []),
                core
            ];
            await runWithRetry(ctx, () => compose(chain)(ctx), { retry: ext.retry, delay: retryDelay });
            return ctx.result;
        };

        if (hasCallback) {
            // 回调模式：返回 undefined（与原生一致），异步触发 success/fail/complete
            run().then(
                (res) => {
                    if (success) success(res);
                    if (complete) complete(res);
                },
                (err) => {
                    if (fail) fail(err);
                    if (complete) complete(err);
                }
            );
            return undefined;
        }
        return run();
    };
}

/** 链尾：纯透传调原生，不 normalize。 */
const core: Interceptor = async function core(ctx) {
    const fn = ctx.method === 'getLocation' ? ctx.provider.getLocation : ctx.provider.getFuzzyLocation;
    if (typeof fn !== 'function') {
        throw new LocationError('UNSUPPORTED', `${ctx.method}:fail not supported`);
    }
    ctx.result = await promisify<unknown>(fn, ctx.nativeArgs);
};
