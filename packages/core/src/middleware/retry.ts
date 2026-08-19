import { LocationError } from '../errors';
import type { LocationContext } from '../types';

export interface RetryOptions {
    retry?: number;
    /** 可注入的延迟函数，便于测试。默认基于 setTimeout。 */
    delay?: (ms: number) => Promise<void>;
}

export function defaultDelay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * 重试 runner。
 *
 * 实现说明：koa-compose 的 next() 只允许调用一次（其内部有 index 守卫，再次调用会抛
 * "next() called multiple times"）。因此重试不能作为 koa 中间件放在链内循环调用 next。
 * 这里把重试做成**包裹整条 compose 链的外层 runner**：exec() 执行整条链，失败时按策略重跑。
 *
 * 终态判定：库源错误（LocationError）一律不重试（超时/取消/不支持/权限都是终态）；
 * 原生错误交由 provider.isTransientError 决定（缺省时默认可重试）。
 */
export async function runWithRetry(
    ctx: LocationContext,
    exec: () => Promise<void>,
    opts: RetryOptions = {}
): Promise<void> {
    const max = opts.retry ?? 0;
    const delay = opts.delay ?? defaultDelay;
    for (let attempt = 0; ; attempt++) {
        try {
            await exec();
            return;
        } catch (err) {
            if (err instanceof LocationError) throw err;
            const isTransient = typeof ctx.provider.isTransientError === 'function'
                ? ctx.provider.isTransientError(err)
                : true;
            if (!isTransient) throw err;
            if (attempt >= max) throw err;
            ctx.result = undefined; // 清掉上一次的残留，避免误用
            await delay(Math.pow(2, attempt) * 100);
        }
    }
}
