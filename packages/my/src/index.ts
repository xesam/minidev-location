import { createMethod, createProvider, permission as permissionCore, LocationError } from '@mini-dev/location';
import type { Provider } from '@mini-dev/location';
import { isTransientError } from './strategies';

// my = 支付宝小程序全局；本包仅在支付宝环境使用，不防御其缺席。
declare const my: any;

export { isTransientError };
export type { Provider };

/**
 * my（支付宝）默认授权 scope。支付宝的 authSetting 与 authorize 用短名 `location`，
 * 与 wx/tt 的 `scope.userLocation` 不同。支付宝的定位授权多由 getLocation 首次调用时
 * 系统自动弹窗，permission 中间件在支付宝上主要用于"已拒绝后预判 blocked"。
 * 不同平台权限交互差异较大，必要时通过 opts.scope 显式覆盖，以平台当前文档为准。
 */
const defaultScope = (_method: 'getLocation' | 'getFuzzyLocation'): string => 'location';

/**
 * 构造 my Provider：首次调用时懒绑 my 全局，注入 my 的 isTransientError。
 * getLocation 存在性由核心 createProvider 兜底校验。
 */
export function createMyProvider(): Provider {
    return createProvider(my, isTransientError);
}

/** my 默认单例：仅 getLocation（支付宝无 getFuzzyLocation）。不探测；首次调用才懒绑 my。 */
export const getLocation = createMethod('getLocation', { provider: createMyProvider });

/**
 * my 权限中间件包装：在核心 `permission` 上注入 my 的 defaultScope（`location`）。
 * `opts.scope` 显式覆盖；`opts.onBlocked` 把"是否弹窗/跳 openSetting"交给 app。
 */
export function permission(opts: { scope?: string; onBlocked?: (e: LocationError) => void } = {}) {
    return permissionCore({
        scopeFor: opts.scope ? () => opts.scope as string : defaultScope,
        onBlocked: opts.onBlocked
    });
}

export { createMethod, createProvider, LocationError };
