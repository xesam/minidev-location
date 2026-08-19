import { LocationError } from '../errors';
import type { Interceptor, LocationContext } from '../types';

/**
 * 取消中间件：ext.signal 已 abort 或在请求中 abort 时抛 CANCELLED。
 * 原生调用无法取消，abort 后迟到的 success 被忽略。
 */
export function createAbortInterceptor(): Interceptor {
    return async function abort(ctx: LocationContext, next) {
        const signal = ctx.ext.signal;
        if (!signal) {
            return next();
        }
        if (signal.aborted) {
            throw new LocationError('CANCELLED', 'getLocation:fail aborted');
        }
        return new Promise<void>((resolve, reject) => {
            const onAbort = () => {
                reject(new LocationError('CANCELLED', 'getLocation:fail aborted'));
            };
            signal.addEventListener('abort', onAbort);
            next().then(
                () => {
                    signal.removeEventListener('abort', onAbort);
                    resolve();
                },
                (err) => {
                    signal.removeEventListener('abort', onAbort);
                    reject(err);
                }
            );
        });
    };
}
