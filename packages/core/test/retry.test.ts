import { LocationError } from '../src/errors';
import { runWithRetry } from '../src/middleware/retry';
import type { LocationContext, Provider } from '../src/types';

function ctx(provider?: Partial<Provider>): LocationContext {
    return {
        method: 'getLocation',
        options: {},
        nativeArgs: {},
        ext: {},
        provider: { ...provider } as Provider,
        result: undefined,
        state: {}
    };
}

const instantDelay = () => Promise.resolve();

describe('runWithRetry', () => {
    it('retry=0 不重试', async () => {
        const exec = jest.fn(async () => {
            throw new Error('net');
        });
        await expect(runWithRetry(ctx(), exec, { retry: 0, delay: instantDelay })).rejects.toThrow('net');
        expect(exec).toHaveBeenCalledTimes(1);
    });

    it('对可重试的普通错误重试 N 次后抛', async () => {
        const exec = jest.fn(async () => {
            throw new Error('net');
        });
        await expect(runWithRetry(ctx(), exec, { retry: 2, delay: instantDelay })).rejects.toThrow('net');
        expect(exec).toHaveBeenCalledTimes(3);
    });

    it('成功即返回不再重试', async () => {
        let n = 0;
        const exec = jest.fn(async () => {
            if (++n < 2) throw new Error('net');
        });
        await runWithRetry(ctx(), exec, { retry: 3, delay: instantDelay });
        expect(exec).toHaveBeenCalledTimes(2);
    });

    it('重试前清掉上一次残留 result', async () => {
        let n = 0;
        const c = ctx();
        const exec = jest.fn(async () => {
            if (++n === 1) {
                c.result = { stale: true } as any;
                throw new Error('net');
            }
        });
        await runWithRetry(c, exec, { retry: 1, delay: instantDelay });
        expect(c.result).toBeUndefined();
        expect(exec).toHaveBeenCalledTimes(2);
    });

    it.each(['TIMEOUT', 'CANCELLED', 'UNSUPPORTED', 'PERMISSION_DENIED', 'PERMISSION_BLOCKED'] as const)(
        '库源错误 %s 终态不重试',
        async (code) => {
            const exec = jest.fn(async () => {
                throw new LocationError(code, 'x');
            });
            await expect(runWithRetry(ctx(), exec, { retry: 3, delay: instantDelay })).rejects.toMatchObject({ code });
            expect(exec).toHaveBeenCalledTimes(1);
        }
    );

    it('provider.isTransientError 返回 false 时不重试', async () => {
        const exec = jest.fn(async () => {
            throw { errMsg: 'auth deny' };
        });
        await expect(
            runWithRetry(ctx({ isTransientError: () => false }), exec, { retry: 3, delay: instantDelay })
        ).rejects.toEqual({ errMsg: 'auth deny' });
        expect(exec).toHaveBeenCalledTimes(1);
    });

    it('provider.isTransientError 返回 true 时重试', async () => {
        let n = 0;
        const exec = jest.fn(async () => {
            if (++n < 3) throw { error: 12 };
        });
        await runWithRetry(ctx({ isTransientError: () => true }), exec, { retry: 3, delay: instantDelay });
        expect(exec).toHaveBeenCalledTimes(3);
    });

    it('默认 delay 基于 setTimeout（真实退避）', async () => {
        const exec = jest.fn(async () => {
            throw new Error('net');
        });
        const start = Date.now();
        await expect(runWithRetry(ctx(), exec, { retry: 1 })).rejects.toThrow('net');
        expect(Date.now() - start).toBeGreaterThanOrEqual(90);
    });

    it('opts 缺省时使用默认（retry=0、默认 delay）且成功', async () => {
        const exec = jest.fn(async () => {});
        await runWithRetry(ctx(), exec);
        expect(exec).toHaveBeenCalledTimes(1);
    });
});
