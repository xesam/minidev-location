import { permission, createProvider } from '../src';
import { isTransientError } from '../src/strategies';
import type { LocationContext } from '@mini-dev/location';

function ctx(provider: any, method: 'getLocation' | 'getFuzzyLocation' = 'getLocation'): LocationContext {
    return { method, options: {}, nativeArgs: {}, ext: {}, provider, result: undefined, state: {} };
}

function nativeWith(overrides: any = {}) {
    return {
        getLocation: jest.fn(),
        getSetting:
            overrides.getSetting ?? jest.fn((o: any) => o.success({ authSetting: overrides.authSetting ?? {} })),
        authorize: overrides.authorize ?? jest.fn((o: any) => o.success && o.success()),
        ...overrides.extra
    };
}

describe('tt permission 包装', () => {
    it('getLocation 默认 scope.userLocation', async () => {
        const authorize = jest.fn((o: any) => o.success());
        const p = createProvider(nativeWith({ authSetting: {}, authorize }), isTransientError);
        const next = jest.fn(async () => {});
        await permission()(ctx(p, 'getLocation'), next);
        expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ scope: 'scope.userLocation' }));
    });

    it('getFuzzyLocation 默认 scope.userFuzzyLocation（defaultScope 分支，即便 tt 不导出该单例）', async () => {
        const authorize = jest.fn((o: any) => o.success());
        const p = createProvider(nativeWith({ authSetting: {}, authorize }), isTransientError);
        const next = jest.fn(async () => {});
        await permission()(ctx(p, 'getFuzzyLocation'), next);
        expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ scope: 'scope.userFuzzyLocation' }));
    });

    it('显式 scope 覆盖默认', async () => {
        const authorize = jest.fn((o: any) => o.success());
        const p = createProvider(nativeWith({ authSetting: {}, authorize }), isTransientError);
        const next = jest.fn(async () => {});
        await permission({ scope: 'scope.userLocationBackground' })(ctx(p, 'getLocation'), next);
        expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ scope: 'scope.userLocationBackground' }));
    });
});
