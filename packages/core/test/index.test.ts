import * as api from '../src/index';
import { createMethod, createProvider, LocationError, permission } from '../src/index';

describe('index exports', () => {
    it('导出核心公开符号', () => {
        expect(typeof createMethod).toBe('function');
        expect(typeof createProvider).toBe('function');
        expect(LocationError).toBeDefined();
        expect(typeof permission).toBe('function');
    });

    it('不导出默认单例（核心无平台单例，由各平台库提供）', () => {
        expect((api as any).default).toBeUndefined();
        expect((api as any).getLocation).toBeUndefined();
        expect((api as any).getFuzzyLocation).toBeUndefined();
    });

    it('不导出平台细节与内部实现', () => {
        expect((api as any).Platform).toBeUndefined();
        expect((api as any).TRANSIENT).toBeUndefined();
        expect((api as any).isTransientError).toBeUndefined();
        expect((api as any).LocationCache).toBeUndefined();
        expect((api as any).compose).toBeUndefined();
        expect((api as any).createCompose).toBeUndefined();
        expect((api as any).LocationClient).toBeUndefined();
        expect((api as any).createClient).toBeUndefined();
    });
});
