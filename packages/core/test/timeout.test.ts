import { createTimeoutInterceptor } from '../src/middleware/timeout';
import type { LocationContext, Provider } from '../src/types';

function ctx(ext: any): LocationContext {
    return {
        method: 'getLocation',
        options: { ext } as any,
        nativeArgs: {},
        ext,
        provider: {} as Provider,
        result: undefined,
        state: {}
    };
}

describe('createTimeoutInterceptor', () => {
    it('无 timeout 透传', async () => {
        const next = jest.fn(async () => {});
        await createTimeoutInterceptor()(ctx({}), next);
        expect(next).toHaveBeenCalled();
    });

    it('timeout<=0 透传', async () => {
        const next = jest.fn(async () => {});
        await createTimeoutInterceptor()(ctx({ timeout: 0 }), next);
        expect(next).toHaveBeenCalled();
    });

    it('超时抛 TIMEOUT', async () => {
        const next = jest.fn(async () => {
            await new Promise((r) => setTimeout(r, 50));
        });
        await expect(createTimeoutInterceptor()(ctx({ timeout: 20 }), next)).rejects.toMatchObject({ code: 'TIMEOUT' });
        await new Promise((r) => setTimeout(r, 60));
    });

    it('next 先完成则正常 resolve', async () => {
        const next = jest.fn(async () => {});
        await createTimeoutInterceptor()(ctx({ timeout: 100 }), next);
        expect(next).toHaveBeenCalled();
    });

    it('next 失败时透传错误', async () => {
        const next = jest.fn(async () => {
            throw new Error('boom');
        });
        await expect(createTimeoutInterceptor()(ctx({ timeout: 100 }), next)).rejects.toThrow('boom');
    });

    it('超时先于 next 失败时仍按 TIMEOUT 拒绝', async () => {
        const next = jest.fn(async () => {
            await new Promise((r) => setTimeout(r, 50));
            throw new Error('boom');
        });
        await expect(createTimeoutInterceptor()(ctx({ timeout: 20 }), next)).rejects.toMatchObject({ code: 'TIMEOUT' });
        await new Promise((r) => setTimeout(r, 60));
    });
});
