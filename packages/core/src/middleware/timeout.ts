import { LocationError } from '../errors';
import type { Interceptor, LocationContext } from '../types';

/**
 * 超时中间件：ext.timeout > 0 时用 Promise.race 计时。
 * 原生调用无法取消，超时后迟到的 success 被忽略（done 标记）。
 */
export function createTimeoutInterceptor(): Interceptor {
    return async function timeout(ctx: LocationContext, next) {
        const t = ctx.ext.timeout;
        if (typeof t !== 'number' || t <= 0) {
            return next();
        }
        let done = false;
        return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                done = true;
                reject(new LocationError('TIMEOUT', `getLocation:fail timeout ${t}`));
            }, t);
            next().then(
                () => {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    resolve();
                },
                (err) => {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    reject(err);
                }
            );
        });
    };
}
