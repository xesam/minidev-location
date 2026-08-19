import { createMethod, createProvider, permission as permissionCore, LocationError } from '@mini-dev/location';
import type { Provider } from '@mini-dev/location';
import { isTransientError } from './strategies';

// wx = 微信小程序全局；本包仅在微信环境使用，不防御其缺席。
declare const wx: any;

export { isTransientError };
export type { Provider };

/**
 * wx 默认授权 scope。wx.getSetting 返回的 authSetting 用 `scope.userLocation` /
 * `scope.userFuzzyLocation` 作为 key。
 */
const defaultScope = (method: 'getLocation' | 'getFuzzyLocation'): string =>
    method === 'getFuzzyLocation' ? 'scope.userFuzzyLocation' : 'scope.userLocation';

/**
 * 构造 wx Provider：首次调用时懒绑 wx 全局，注入 wx 的 isTransientError。
 * getLocation 存在性由核心 createProvider 兜底校验。
 */
export function createWxProvider(): Provider {
    return createProvider(wx, isTransientError);
}

/** wx 默认单例：getLocation + getFuzzyLocation。不探测；首次调用才懒绑 wx。 */
export const getLocation = createMethod('getLocation', { provider: createWxProvider });
export const getFuzzyLocation = createMethod('getFuzzyLocation', { provider: createWxProvider });

/**
 * wx 权限中间件包装：在核心 `permission` 上注入 wx 的 defaultScope。
 * `opts.scope` 显式覆盖；`opts.onBlocked` 把"是否弹窗/跳 openSetting"交给 app。
 */
export function permission(opts: { scope?: string; onBlocked?: (e: LocationError) => void } = {}) {
    return permissionCore({
        scopeFor: opts.scope ? () => opts.scope as string : defaultScope,
        onBlocked: opts.onBlocked
    });
}

export { createMethod, createProvider, LocationError };
