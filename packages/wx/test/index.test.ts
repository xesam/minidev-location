import { getLocation, getFuzzyLocation, createWxProvider, permission, isTransientError, createMethod, createProvider, LocationError } from '../src';

describe('@mini-dev/location-wx 导出', () => {
    it('导出默认单例与平台 API', () => {
        expect(typeof getLocation).toBe('function');
        expect(typeof getFuzzyLocation).toBe('function');
        expect(typeof createWxProvider).toBe('function');
        expect(typeof permission).toBe('function');
        expect(typeof isTransientError).toBe('function');
        expect(typeof createMethod).toBe('function');
        expect(typeof createProvider).toBe('function');
        expect(LocationError).toBeDefined();
    });
});

describe('createWxProvider', () => {
    it('懒绑 wx 并返回 Provider', () => {
        const before = (globalThis as any).wx;
        (globalThis as any).wx = { getLocation: (o: any) => o.success({ latitude: 1, longitude: 2, accuracy: 3 }) };
        try {
            const p = createWxProvider();
            expect(typeof p.getLocation).toBe('function');
            expect(typeof p.isTransientError).toBe('function');
        } finally {
            if (before === undefined) delete (globalThis as any).wx;
            else (globalThis as any).wx = before;
        }
    });

    it('经 createMethod 调用透传原生结果（懒绑）', async () => {
        const before = (globalThis as any).wx;
        (globalThis as any).wx = { getLocation: (o: any) => o.success({ latitude: 5, longitude: 6, accuracy: 7 }) };
        try {
            const loc = createMethod('getLocation', { provider: createWxProvider });
            const r = await loc({ type: 'gcj02' });
            expect(r).toEqual({ latitude: 5, longitude: 6, accuracy: 7 });
        } finally {
            if (before === undefined) delete (globalThis as any).wx;
            else (globalThis as any).wx = before;
        }
    });
});
