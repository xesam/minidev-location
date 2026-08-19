import { stableKey } from '../util';
import type { Interceptor, LocationContext } from '../types';

interface CacheEntry {
    method: string;
    key: string;
    timestamp: number;
    data: unknown;
}

/**
 * 位置缓存：固定容量环形 + TTL。
 * 键为 (method, nativeArgs 的稳定串)，method 自身已含 fuzzy 区分（getFuzzyLocation vs getLocation），
 * nativeArgs 已编码平台差异（坐标系/丰富度等），无需 per-platform 策略。
 */
export class LocationCache {
    private entries: CacheEntry[] = [];
    private readonly maxSize: number;

    constructor(maxSize = 3) {
        this.maxSize = maxSize;
    }

    get(method: string, key: string, maxAge: number, now: number): unknown {
        for (let i = this.entries.length - 1; i >= 0; i--) {
            const e = this.entries[i];
            if (e.method !== method || e.key !== key) continue;
            if (now - e.timestamp <= maxAge) return e.data;
            // 命中键但已过期：同键理论上只一条，直接判 miss
            return undefined;
        }
        return undefined;
    }

    set(method: string, key: string, data: unknown, now: number): void {
        this.entries.push({ method, key, timestamp: now, data });
        if (this.entries.length > this.maxSize) {
            this.entries.shift();
        }
    }

    clear(): void {
        this.entries = [];
    }

    get size(): number {
        return this.entries.length;
    }
}

export interface CacheInterceptorOptions {
    cache: LocationCache;
    now?: () => number;
}

/** 缓存中间件：ext.maxAge > 0 时启用，命中短路、不调原生；未命中则下游取数后写入。 */
export function createCacheInterceptor(opts: CacheInterceptorOptions): Interceptor {
    const now = opts.now ?? Date.now;
    return async function cache(ctx: LocationContext, next) {
        const maxAge = ctx.ext.maxAge;
        const enabled = typeof maxAge === 'number' && maxAge > 0;
        const key = ctx.method + ':' + stableKey(ctx.nativeArgs);
        if (enabled) {
            const hit = opts.cache.get(ctx.method, key, maxAge, now());
            if (hit !== undefined) {
                ctx.result = hit;
                return;
            }
        }
        await next();
        if (enabled && ctx.result !== undefined) {
            opts.cache.set(ctx.method, key, ctx.result, now());
        }
    };
}
