import { createAbortInterceptor } from '../src/middleware/abort';
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

describe('createAbortInterceptor', () => {
    it('无 signal 透传', async () => {
        const next = jest.fn(async () => {});
        await createAbortInterceptor()(ctx({}), next);
        expect(next).toHaveBeenCalled();
    });

    it('已 abort 抛 CANCELLED 且不调 next', async () => {
        const ac = new AbortController();
        ac.abort();
        const next = jest.fn(async () => {});
        await expect(createAbortInterceptor()(ctx({ signal: ac.signal }), next)).rejects.toMatchObject({ code: 'CANCELLED' });
        expect(next).not.toHaveBeenCalled();
    });

    it('请求中 abort 抛 CANCELLED', async () => {
        const ac = new AbortController();
        const next = jest.fn(
            () =>
                new Promise<void>((resolve) => {
                    ac.signal.addEventListener('abort', () => resolve());
                })
        );
        const p = createAbortInterceptor()(ctx({ signal: ac.signal }), next);
        setTimeout(() => ac.abort(), 10);
        await expect(p).rejects.toMatchObject({ code: 'CANCELLED' });
    });

    it('成功则移除监听并 resolve', async () => {
        const ac = new AbortController();
        const next = jest.fn(async () => {});
        await createAbortInterceptor()(ctx({ signal: ac.signal }), next);
        expect(next).toHaveBeenCalled();
        ac.abort();
        await new Promise((r) => setTimeout(r, 10));
    });

    it('next 失败时透传错误并移除监听', async () => {
        const ac = new AbortController();
        const next = jest.fn(async () => {
            throw new Error('boom');
        });
        await expect(createAbortInterceptor()(ctx({ signal: ac.signal }), next)).rejects.toThrow('boom');
    });
});
