import { createCacheInterceptor, LocationCache } from '../src/middleware/cache';
import type { LocationContext, Provider } from '../src/types';

function makeCtx(ext: any, nativeArgs: Record<string, unknown> = {}, method: 'getLocation' | 'getFuzzyLocation' = 'getLocation'): LocationContext {
    return {
        method,
        options: { ext, ...nativeArgs } as any,
        nativeArgs,
        ext,
        provider: {} as Provider,
        result: undefined,
        state: {}
    };
}

describe('LocationCache', () => {
    it('set/get 命中', () => {
        const c = new LocationCache(3);
        c.set('getLocation', 'k1', { v: 1 }, 100);
        expect(c.get('getLocation', 'k1', 1000, 200)).toEqual({ v: 1 });
    });

    it('method 不匹配 miss', () => {
        const c = new LocationCache();
        c.set('getLocation', 'k1', { v: 1 }, 100);
        expect(c.get('getFuzzyLocation', 'k1', 1000, 200)).toBeUndefined();
    });

    it('key 不匹配 miss', () => {
        const c = new LocationCache();
        c.set('getLocation', 'k1', { v: 1 }, 100);
        expect(c.get('getLocation', 'k2', 1000, 200)).toBeUndefined();
    });

    it('过期 miss', () => {
        const c = new LocationCache();
        c.set('getLocation', 'k1', { v: 1 }, 100);
        expect(c.get('getLocation', 'k1', 100, 201)).toBeUndefined();
    });

    it('maxSize 驱逐最旧', () => {
        const c = new LocationCache(2);
        c.set('getLocation', 'k1', { v: 1 }, 1);
        c.set('getLocation', 'k2', { v: 2 }, 2);
        c.set('getLocation', 'k1', { v: 3 }, 3);
        expect(c.size).toBe(2);
        expect(c.get('getLocation', 'k1', 1000, 3)).toEqual({ v: 3 });
    });

    it('clear / size', () => {
        const c = new LocationCache();
        c.set('getLocation', 'k1', { v: 1 }, 1);
        expect(c.size).toBe(1);
        c.clear();
        expect(c.size).toBe(0);
    });
});

describe('createCacheInterceptor', () => {
    it('命中短路不调 next', async () => {
        const cache = new LocationCache();
        cache.set('getLocation', 'getLocation:' + JSON.stringify({ type: 'wgs84' }), { cached: true }, 50);
        const next = jest.fn(async () => {
            (ctx as any).result = { fresh: true };
        });
        const ctx = makeCtx({ maxAge: 100 }, { type: 'wgs84' });
        await createCacheInterceptor({ cache, now: () => 100 })(ctx, next);
        expect(next).not.toHaveBeenCalled();
        expect(ctx.result).toEqual({ cached: true });
    });

    it('未命中调 next 并写入', async () => {
        const cache = new LocationCache();
        const ctx = makeCtx({ maxAge: 100 }, { type: 'wgs84' });
        const next = jest.fn(async () => {
            ctx.result = { fresh: true };
        });
        await createCacheInterceptor({ cache, now: () => 100 })(ctx, next);
        expect(next).toHaveBeenCalled();
        expect(cache.get('getLocation', 'getLocation:' + JSON.stringify({ type: 'wgs84' }), 1000, 100)).toEqual({ fresh: true });
    });

    it('maxAge<=0 透传不缓存', async () => {
        const cache = new LocationCache();
        const ctx = makeCtx({ maxAge: 0 }, { type: 'wgs84' });
        const next = jest.fn(async () => {
            ctx.result = { fresh: true };
        });
        await createCacheInterceptor({ cache, now: () => 100 })(ctx, next);
        expect(next).toHaveBeenCalled();
        expect(cache.size).toBe(0);
    });

    it('启用缓存但 next 未产出 result 时不写入', async () => {
        const cache = new LocationCache();
        const ctx = makeCtx({ maxAge: 100 }, { type: 'wgs84' });
        const next = jest.fn(async () => {
            /* 不设置 ctx.result */
        });
        await createCacheInterceptor({ cache, now: () => 100 })(ctx, next);
        expect(next).toHaveBeenCalled();
        expect(cache.size).toBe(0);
    });

    it('未注入 now 时回退 Date.now', async () => {
        const cache = new LocationCache();
        const ctx = makeCtx({ maxAge: 100 }, { type: 'wgs84' });
        const next = jest.fn(async () => {
            ctx.result = { fresh: true };
        });
        await createCacheInterceptor({ cache })(ctx, next);
        expect(cache.size).toBe(1);
    });

    it('getFuzzyLocation 与 getLocation 不互命中（method 隔离）', async () => {
        const cache = new LocationCache();
        const fuzzyCtx = makeCtx({ maxAge: 100 }, { type: 'wgs84' }, 'getFuzzyLocation');
        const next = jest.fn(async () => {
            fuzzyCtx.result = { fuzzy: true };
        });
        await createCacheInterceptor({ cache, now: () => 100 })(fuzzyCtx, next);
        const locCtx = makeCtx({ maxAge: 100 }, { type: 'wgs84' }, 'getLocation');
        const locNext = jest.fn(async () => {
            locCtx.result = { loc: true };
        });
        await createCacheInterceptor({ cache, now: () => 100 })(locCtx, locNext);
        expect(cache.size).toBe(2);
    });
});
