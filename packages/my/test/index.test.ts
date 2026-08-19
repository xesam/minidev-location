import { getLocation, createMyProvider, permission, isTransientError, createMethod, createProvider, LocationError } from '../src';

describe('@mini-dev/location-my 导出', () => {
    it('导出 getLocation 与平台 API，无 getFuzzyLocation', () => {
        expect(typeof getLocation).toBe('function');
        expect(typeof createMyProvider).toBe('function');
        expect(typeof permission).toBe('function');
        expect(typeof isTransientError).toBe('function');
        expect(typeof createMethod).toBe('function');
        expect(typeof createProvider).toBe('function');
        expect(LocationError).toBeDefined();
        // my 无 getFuzzyLocation
        expect((require('../src') as any).getFuzzyLocation).toBeUndefined();
    });
});

describe('createMyProvider', () => {
    it('懒绑 my 并返回 Provider', () => {
        const before = (globalThis as any).my;
        (globalThis as any).my = { getLocation: (o: any) => o.success({ latitude: 1, longitude: 2, accuracy: 3 }) };
        try {
            const p = createMyProvider();
            expect(typeof p.getLocation).toBe('function');
            expect(typeof p.isTransientError).toBe('function');
            expect(p.getFuzzyLocation).toBeUndefined();
        } finally {
            if (before === undefined) delete (globalThis as any).my;
            else (globalThis as any).my = before;
        }
    });

    it('经 createMethod 调用透传原生结果（懒绑）', async () => {
        const before = (globalThis as any).my;
        (globalThis as any).my = { getLocation: (o: any) => o.success({ latitude: 5, longitude: 6, accuracy: 7 }) };
        try {
            const loc = createMethod('getLocation', { provider: createMyProvider });
            const r = await loc({ type: 1 });
            expect(r).toEqual({ latitude: 5, longitude: 6, accuracy: 7 });
        } finally {
            if (before === undefined) delete (globalThis as any).my;
            else (globalThis as any).my = before;
        }
    });
});
