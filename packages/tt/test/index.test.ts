import { getLocation, createTtProvider, permission, isTransientError, createMethod, createProvider, LocationError } from '../src';

describe('@mini-dev/location-tt 导出', () => {
    it('导出 getLocation 与平台 API，无 getFuzzyLocation', () => {
        expect(typeof getLocation).toBe('function');
        expect(typeof createTtProvider).toBe('function');
        expect(typeof permission).toBe('function');
        expect(typeof isTransientError).toBe('function');
        expect(typeof createMethod).toBe('function');
        expect(typeof createProvider).toBe('function');
        expect(LocationError).toBeDefined();
        expect((require('../src') as any).getFuzzyLocation).toBeUndefined();
    });
});

describe('createTtProvider', () => {
    it('懒绑 tt 并返回 Provider', () => {
        const before = (globalThis as any).tt;
        (globalThis as any).tt = { getLocation: (o: any) => o.success({ latitude: 1, longitude: 2, accuracy: 3 }) };
        try {
            const p = createTtProvider();
            expect(typeof p.getLocation).toBe('function');
            expect(typeof p.isTransientError).toBe('function');
            expect(p.getFuzzyLocation).toBeUndefined();
        } finally {
            if (before === undefined) delete (globalThis as any).tt;
            else (globalThis as any).tt = before;
        }
    });

    it('经 createMethod 调用透传原生结果（懒绑）', async () => {
        const before = (globalThis as any).tt;
        (globalThis as any).tt = { getLocation: (o: any) => o.success({ latitude: 8, longitude: 9, accuracy: 10 }) };
        try {
            const loc = createMethod('getLocation', { provider: createTtProvider });
            const r = await loc({});
            expect(r).toEqual({ latitude: 8, longitude: 9, accuracy: 10 });
        } finally {
            if (before === undefined) delete (globalThis as any).tt;
            else (globalThis as any).tt = before;
        }
    });
});
