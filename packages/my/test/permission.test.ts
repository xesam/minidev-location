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

describe('my permission 包装', () => {
    it('getLocation 默认 scope=location', async () => {
        const authorize = jest.fn((o: any) => o.success());
        const p = createProvider(nativeWith({ authSetting: {}, authorize }), isTransientError);
        const next = jest.fn(async () => {});
        await permission()(ctx(p, 'getLocation'), next);
        expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ scope: 'location' }));
    });

    it('显式 scope 覆盖默认', async () => {
        const authorize = jest.fn((o: any) => o.success());
        const p = createProvider(nativeWith({ authSetting: {}, authorize }), isTransientError);
        const next = jest.fn(async () => {});
        await permission({ scope: 'scope.userLocation' })(ctx(p, 'getLocation'), next);
        expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ scope: 'scope.userLocation' }));
    });

    it('status=false 用 location scope 查 authSetting 并抛 PERMISSION_BLOCKED', async () => {
        const onBlocked = jest.fn();
        const p = createProvider(nativeWith({ authSetting: { location: false } }), isTransientError);
        const next = jest.fn(async () => {});
        await expect(permission({ onBlocked })(ctx(p, 'getLocation'), next)).rejects.toMatchObject({
            code: 'PERMISSION_BLOCKED'
        });
        expect(onBlocked).toHaveBeenCalledTimes(1);
        expect(next).not.toHaveBeenCalled();
    });
});
