import { LocationError } from '../src/errors';
import { createMethod } from '../src/method';
import { createProvider } from '../src/providers/base';
import type { Interceptor, Provider } from '../src/types';

/** 构造一个原生对象：getLocation 默认成功返回固定结果。 */
function nativeWith(overrides: any = {}) {
    const base = {
        getLocation: jest.fn((opts: any) => {
            if (overrides.fail) return opts.fail && opts.fail(overrides.fail);
            opts.success && opts.success({ latitude: 1, longitude: 2, accuracy: 3, ...overrides.successExtra });
        }),
        ...overrides.extra
    };
    return base;
}

const wx = () => nativeWith();

/** 用一个原生对象构造 Provider 工厂（懒调），供 createMethod 注入。 */
function provider(n: any, isTransientError: (e: unknown) => boolean = () => true): () => Provider {
    return () => createProvider(n, isTransientError);
}

describe('createMethod — 透传', () => {
    it('返回原生响应原样，不带归一字段', async () => {
        const getLocation = createMethod('getLocation', { provider: provider(wx()) });
        const r = await getLocation({ type: 'gcj02' });
        expect(r).toEqual({ latitude: 1, longitude: 2, accuracy: 3 });
    });

    it('原生参数平铺透传，ext 不进原生（回调由 promisify 内部接管）', async () => {
        const n = wx();
        const getLocation = createMethod('getLocation', { provider: provider(n) });
        await getLocation({ type: 'gcj02', altitude: true, ext: { timeout: 1000 } });
        expect(n.getLocation).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'gcj02', altitude: true })
        );
        const arg = n.getLocation.mock.calls[0][0];
        expect(arg.ext).toBeUndefined(); // ext 被剥
        expect(typeof arg.success).toBe('function'); // promisify 内部回调
        expect(typeof arg.fail).toBe('function');
    });

    it('缺省 opts 透传空 nativeArgs', async () => {
        const n = wx();
        const getLocation = createMethod('getLocation', { provider: provider(n) });
        await getLocation();
        expect(n.getLocation).toHaveBeenCalledWith(expect.objectContaining({ success: expect.any(Function), fail: expect.any(Function) }));
    });
});

describe('createMethod — 错误透传与库源错误', () => {
    it('原生失败原样 reject（不包成 LocationError）', async () => {
        const n = nativeWith({ fail: { errMsg: 'getLocation:fail auth deny' } });
        const getLocation = createMethod('getLocation', { provider: provider(n) });
        await expect(getLocation({})).rejects.toEqual({ errMsg: 'getLocation:fail auth deny' });
    });

    it('超时抛 LocationError(TIMEOUT) 且不被 retry 重试', async () => {
        const n = nativeWith({
            extra: {
                getLocation: jest.fn((opts: any) => setTimeout(() => opts.success({ latitude: 1 }), 50))
            }
        });
        const getLocation = createMethod('getLocation', { provider: provider(n) });
        await expect(getLocation({ ext: { timeout: 20, retry: 3 } })).rejects.toMatchObject({ code: 'TIMEOUT' });
        expect(n.getLocation).toHaveBeenCalledTimes(1); // 库源错误终态，不重试
        await new Promise((r) => setTimeout(r, 60));
    });

    it('已 abort 抛 LocationError(CANCELLED)', async () => {
        const ac = new AbortController();
        ac.abort();
        const n = wx();
        const getLocation = createMethod('getLocation', { provider: provider(n) });
        await expect(getLocation({ ext: { signal: ac.signal } })).rejects.toMatchObject({ code: 'CANCELLED' });
        expect(n.getLocation).not.toHaveBeenCalled();
    });

    it('方法在 Provider 上不存在抛 LocationError(UNSUPPORTED)', async () => {
        const n = wx(); // 无 getFuzzyLocation
        const getFuzzy = createMethod('getFuzzyLocation', { provider: provider(n) });
        await expect(getFuzzy({})).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    });

    it('provider 工厂抛错时调用 reject 该错误，且下次调用重试工厂（懒调、未缓存）', async () => {
        let calls = 0;
        const getLocation = createMethod('getLocation', {
            provider: () => {
                calls++;
                throw new LocationError('UNSUPPORTED', 'wx: getLocation not found');
            }
        });
        await expect(getLocation({})).rejects.toMatchObject({ code: 'UNSUPPORTED' });
        await expect(getLocation({})).rejects.toMatchObject({ code: 'UNSUPPORTED' });
        expect(calls).toBe(2); // 工厂抛错未缓存 provider，下次重试
    });
});

describe('createMethod — 缓存', () => {
    it('ext.maxAge 命中第二次不调原生', async () => {
        const n = wx();
        const getLocation = createMethod('getLocation', { provider: provider(n) });
        await getLocation({ type: 'gcj02', ext: { maxAge: 1000 } });
        await getLocation({ type: 'gcj02', ext: { maxAge: 1000 } });
        expect(n.getLocation).toHaveBeenCalledTimes(1);
    });

    it('不同 nativeArgs 不互相命中', async () => {
        const n = wx();
        const getLocation = createMethod('getLocation', { provider: provider(n) });
        await getLocation({ type: 'wgs84', ext: { maxAge: 1000 } });
        await getLocation({ type: 'gcj02', ext: { maxAge: 1000 } });
        expect(n.getLocation).toHaveBeenCalledTimes(2);
    });

    it('无 maxAge 不缓存，每次调原生', async () => {
        const n = wx();
        const getLocation = createMethod('getLocation', { provider: provider(n) });
        await getLocation({ type: 'gcj02' });
        await getLocation({ type: 'gcj02' });
        expect(n.getLocation).toHaveBeenCalledTimes(2);
    });
});

describe('createMethod — 重试', () => {
    it('瞬时原生错误按 ext.retry 重试', async () => {
        let attempt = 0;
        const n = nativeWith({
            extra: {
                getLocation: jest.fn((opts: any) => {
                    attempt++;
                    if (attempt < 2) return opts.fail({ errMsg: 'getLocation:fail network' });
                    opts.success({ latitude: 1 });
                })
            }
        });
        const getLocation = createMethod('getLocation', { provider: provider(n), retryDelay: () => Promise.resolve() });
        const r = await getLocation({ ext: { retry: 2 } });
        expect(r).toEqual({ latitude: 1 });
        expect(n.getLocation).toHaveBeenCalledTimes(2);
    });

    it('isTransientError 判终态的原生错误不重试', async () => {
        const n = nativeWith({
            extra: {
                getLocation: jest.fn((opts: any) => opts.fail({ errMsg: 'getLocation:fail auth deny' }))
            }
        });
        const getLocation = createMethod('getLocation', {
            provider: provider(n, () => false), // 平台策略判为终态
            retryDelay: () => Promise.resolve()
        });
        await expect(getLocation({ ext: { retry: 3 } })).rejects.toEqual({ errMsg: 'getLocation:fail auth deny' });
        expect(n.getLocation).toHaveBeenCalledTimes(1);
    });
});

describe('createMethod — 回调模式', () => {
    it('提供 success 进入回调模式，返回 undefined', async () => {
        const n = wx();
        const getLocation = createMethod('getLocation', { provider: provider(n) });
        const success = jest.fn();
        const ret = getLocation({ success });
        expect(ret).toBeUndefined();
        await new Promise((r) => setTimeout(r, 10));
        expect(success).toHaveBeenCalledWith({ latitude: 1, longitude: 2, accuracy: 3 });
    });

    it('成功时触发 success 与 complete', async () => {
        const n = wx();
        const getLocation = createMethod('getLocation', { provider: provider(n) });
        const success = jest.fn();
        const complete = jest.fn();
        getLocation({ success, complete });
        await new Promise((r) => setTimeout(r, 10));
        expect(success).toHaveBeenCalledTimes(1);
        expect(complete).toHaveBeenCalledTimes(1);
        expect(complete).toHaveBeenCalledWith({ latitude: 1, longitude: 2, accuracy: 3 });
    });

    it('失败时触发 fail 与 complete（带错误）', async () => {
        const n = nativeWith({ fail: { errMsg: 'x' } });
        const getLocation = createMethod('getLocation', { provider: provider(n) });
        const fail = jest.fn();
        const complete = jest.fn();
        getLocation({ fail, complete });
        await new Promise((r) => setTimeout(r, 10));
        expect(fail).toHaveBeenCalledWith({ errMsg: 'x' });
        expect(complete).toHaveBeenCalledWith({ errMsg: 'x' });
    });

    it('仅 complete 时进入回调模式且失败带 err', async () => {
        const n = nativeWith({ fail: { errMsg: 'y' } });
        const getLocation = createMethod('getLocation', { provider: provider(n) });
        const complete = jest.fn();
        const ret = getLocation({ complete });
        expect(ret).toBeUndefined();
        await new Promise((r) => setTimeout(r, 10));
        expect(complete).toHaveBeenCalledWith({ errMsg: 'y' });
    });

    it('仅 success 时失败不触发 complete（缺省不调）', async () => {
        const n = nativeWith({ fail: { errMsg: 'z' } });
        const getLocation = createMethod('getLocation', { provider: provider(n) });
        const success = jest.fn();
        const complete = jest.fn();
        getLocation({ success, complete });
        await new Promise((r) => setTimeout(r, 10));
        expect(success).not.toHaveBeenCalled();
        expect(complete).toHaveBeenCalledWith({ errMsg: 'z' });
    });
});

describe('createMethod — 拦截器链', () => {
    it('方法默认拦截器与单次 ext.interceptors 按顺序运行', async () => {
        const order: string[] = [];
        const def: Interceptor = async (ctx, next) => {
            order.push('def-before');
            await next();
            order.push('def-after');
        };
        const call: Interceptor = async (ctx, next) => {
            order.push('call-before');
            await next();
            order.push('call-after');
        };
        const n = wx();
        const getLocation = createMethod('getLocation', { provider: provider(n), interceptors: [def] });
        await getLocation({ ext: { interceptors: [call] } });
        expect(order).toEqual(['def-before', 'call-before', 'call-after', 'def-after']);
    });

    it('单次拦截器可改写 result', async () => {
        const n = wx();
        const getLocation = createMethod('getLocation', { provider: provider(n) });
        const add: Interceptor = async (ctx, next) => {
            await next();
            (ctx.result as any).extra = 1;
        };
        const r = await getLocation({ ext: { interceptors: [add] } });
        expect((r as any).extra).toBe(1);
    });

    it('默认拦截器在方法实例上持久（多次调用都生效）', async () => {
        const n = wx();
        let count = 0;
        const def: Interceptor = async (ctx, next) => {
            count++;
            await next();
        };
        const getLocation = createMethod('getLocation', { provider: provider(n), interceptors: [def] });
        await getLocation({});
        await getLocation({});
        expect(count).toBe(2);
    });
});
