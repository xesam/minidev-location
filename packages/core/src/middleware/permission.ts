import { LocationError } from '../errors';
import type { Interceptor, LocationContext, Provider } from '../types';
import { promisify } from '../util';

export interface PermissionInterceptorOptions {
    /**
     * 按方法名解析授权 scope。核心不含平台默认——各平台库的 `permission()` 包装会
     * 注入本平台的 defaultScope；直接用核心 `permission` 时必须显式提供。
     */
    scopeFor: (method: 'getLocation' | 'getFuzzyLocation') => string;
    /** blocked 时回调，把"是否弹窗/跳 openSetting"交给 app。 */
    onBlocked?: (e: LocationError) => void;
}

function getSetting(provider: Provider): Promise<Record<string, boolean>> {
    return promisify<{ authSetting: Record<string, boolean> }>(provider.getSetting!, {}).then(
        (res) => res.authSetting || {}
    );
}

function authorize(provider: Provider, scope: string): Promise<void> {
    return promisify<void>(provider.authorize!, { scope });
}

/**
 * 可选权限中间件（不进默认链）。平台无关——scope 由 `scopeFor` 注入。
 * 契约基于 authSetting 的三态：
 *   true     → 已授权，放行
 *   false    → 曾被拒绝（blocked），抛 PERMISSION_BLOCKED 并触发 onBlocked
 *   undefined → 未问过，调 authorize 弹窗；成功放行，失败抛 PERMISSION_DENIED
 * 平台无 getSetting/authorize 时直接放行，交由原生自己处理。
 */
export function permission(opts: PermissionInterceptorOptions): Interceptor {
    return async function permissionInterceptor(ctx: LocationContext, next) {
        const provider = ctx.provider;
        if (!provider.getSetting || !provider.authorize) {
            return next();
        }
        const scope = opts.scopeFor(ctx.method);

        let setting: Record<string, boolean>;
        try {
            setting = await getSetting(provider);
        } catch {
            // 读不到设置时不阻塞，直接尝试调用，由原生处理
            return next();
        }

        const status = setting[scope];
        if (status === true) {
            return next();
        }
        if (status === false) {
            const err = new LocationError(
                'PERMISSION_BLOCKED',
                `authorize:fail ${scope} blocked`,
                { errMsg: `authorize:fail ${scope} blocked` }
            );
            if (opts.onBlocked) opts.onBlocked(err);
            throw err;
        }
        // undefined → 询问
        try {
            await authorize(provider, scope);
            return next();
        } catch (e) {
            throw new LocationError(
                'PERMISSION_DENIED',
                String((e as { errMsg?: string })?.errMsg ?? 'authorize:fail auth deny'),
                e
            );
        }
    };
}
