import { createMethod, createProvider, permission as permissionCore, LocationError } from '@mini-dev/location';
import type { Provider } from '@mini-dev/location';
import { isTransientError } from './strategies';

// tt = 抖音小程序全局；本包仅在抖音环境使用，不防御其缺席。
declare const tt: any;

export { isTransientError };
export type { Provider };

/**
 * tt 默认授权 scope。抖音沿用微信同款 scope 名：`scope.userLocation` /
 * `scope.userFuzzyLocation`（虽然抖音本包不导出 getFuzzyLocation，仍保留映射以备自建方法）。
 */
const defaultScope = (method: 'getLocation' | 'getFuzzyLocation'): string =>
    method === 'getFuzzyLocation' ? 'scope.userFuzzyLocation' : 'scope.userLocation';

/**
 * 构造 tt Provider：首次调用时懒绑 tt 全局，注入 tt 的 isTransientError。
 * getLocation 存在性由核心 createProvider 兜底校验。
 */
export function createTtProvider(): Provider {
    return createProvider(tt, isTransientError);
}

/** tt 默认单例：仅 getLocation（抖音无 getFuzzyLocation）。不探测；首次调用才懒绑 tt。 */
export const getLocation = createMethod('getLocation', { provider: createTtProvider });

/**
 * tt 权限中间件包装：在核心 `permission` 上注入 tt 的 defaultScope。
 * `opts.scope` 显式覆盖；`opts.onBlocked` 把"是否弹窗/跳 openSetting"交给 app。
 */
export function permission(opts: { scope?: string; onBlocked?: (e: LocationError) => void } = {}) {
    return permissionCore({
        scopeFor: opts.scope ? () => opts.scope as string : defaultScope,
        onBlocked: opts.onBlocked
    });
}

export { createMethod, createProvider, LocationError };
