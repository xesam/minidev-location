import { createProvider } from '../src/providers/base';
import { permission } from '../src/middleware/permission';
import type { LocationContext, Provider } from '../src/types';

function ctx(provider: Provider, method: 'getLocation' | 'getFuzzyLocation' = 'getLocation'): LocationContext {
    return { method, options: {}, nativeArgs: {}, ext: {}, provider, result: undefined, state: {} };
}

function nativeWith(overrides: any = {}) {
    return {
        getLocation: jest.fn(),
        getSetting:
            overrides.getSetting ??
            jest.fn((opts: any) => opts.success({ authSetting: overrides.authSetting ?? {} })),
        authorize: overrides.authorize ?? jest.fn((opts: any) => opts.success && opts.success()),
        ...overrides.extra
    };
}

const transient = () => true;
const scopeFor = (m: 'getLocation' | 'getFuzzyLocation') =>
    m === 'getFuzzyLocation' ? 'scope.userFuzzyLocation' : 'scope.userLocation';

describe('permission middleware', () => {
    it('无 getSetting/authorize 直接放行', async () => {
        const p = createProvider({ getLocation: jest.fn() }, transient);
        const next = jest.fn(async () => {});
        await permission({ scopeFor })(ctx(p), next);
        expect(next).toHaveBeenCalled();
    });

    it('status=true 放行且不调 authorize', async () => {
        const authorize = jest.fn();
        const p = createProvider(
            nativeWith({ authSetting: { 'scope.userLocation': true }, authorize }),
            transient
        );
        const next = jest.fn(async () => {});
        await permission({ scopeFor })(ctx(p), next);
        expect(next).toHaveBeenCalled();
        expect(authorize).not.toHaveBeenCalled();
    });

    it('status=false 抛 PERMISSION_BLOCKED 并触发 onBlocked', async () => {
        const onBlocked = jest.fn();
        const p = createProvider(nativeWith({ authSetting: { 'scope.userLocation': false } }), transient);
        const next = jest.fn(async () => {});
        await expect(permission({ scopeFor, onBlocked })(ctx(p), next)).rejects.toMatchObject({
            code: 'PERMISSION_BLOCKED'
        });
        expect(onBlocked).toHaveBeenCalledTimes(1);
        expect(next).not.toHaveBeenCalled();
    });

    it('status=false 无 onBlocked 时仍抛', async () => {
        const p = createProvider(nativeWith({ authSetting: { 'scope.userLocation': false } }), transient);
        const next = jest.fn(async () => {});
        await expect(permission({ scopeFor })(ctx(p), next)).rejects.toMatchObject({ code: 'PERMISSION_BLOCKED' });
    });

    it('status=undefined 且 authorize 成功放行', async () => {
        const p = createProvider(
            nativeWith({ authSetting: {}, authorize: jest.fn((opts: any) => opts.success()) }),
            transient
        );
        const next = jest.fn(async () => {});
        await permission({ scopeFor })(ctx(p), next);
        expect(next).toHaveBeenCalled();
    });

    it('status=undefined 且 authorize 失败抛 PERMISSION_DENIED', async () => {
        const p = createProvider(
            nativeWith({
                authSetting: {},
                authorize: jest.fn((opts: any) => opts.fail && opts.fail({ errMsg: 'authorize:fail auth deny' }))
            }),
            transient
        );
        const next = jest.fn(async () => {});
        await expect(permission({ scopeFor })(ctx(p), next)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
        expect(next).not.toHaveBeenCalled();
    });

    it('authorize 失败无 errMsg 时使用兜底文案', async () => {
        const p = createProvider(
            nativeWith({ authSetting: {}, authorize: jest.fn((opts: any) => opts.fail && opts.fail()) }),
            transient
        );
        const next = jest.fn(async () => {});
        await expect(permission({ scopeFor })(ctx(p), next)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    });

    it('有 getSetting 但无 authorize 时放行', async () => {
        const n = nativeWith({ authSetting: {} });
        delete n.authorize;
        const p = createProvider(n, transient);
        const next = jest.fn(async () => {});
        await permission({ scopeFor })(ctx(p), next);
        expect(next).toHaveBeenCalled();
    });

    it('getSetting 返回 authSetting 缺省时按空对象处理', async () => {
        const n = {
            getLocation: jest.fn(),
            getSetting: jest.fn((opts: any) => opts.success({ authSetting: undefined })),
            authorize: jest.fn((opts: any) => opts.success())
        };
        const p = createProvider(n, transient);
        const next = jest.fn(async () => {});
        await permission({ scopeFor })(ctx(p), next);
        expect(n.authorize).toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });

    it('getSetting 失败时放行（交由原生处理）', async () => {
        const p = createProvider(
            nativeWith({ getSetting: jest.fn((opts: any) => opts.fail({ errMsg: 'getSetting:fail' })) }),
            transient
        );
        const next = jest.fn(async () => {});
        await permission({ scopeFor })(ctx(p), next);
        expect(next).toHaveBeenCalled();
    });

    it('scopeFor 按 method 选 scope（getFuzzyLocation → scope.userFuzzyLocation）', async () => {
        const authorize = jest.fn((opts: any) => opts.success());
        const p = createProvider(nativeWith({ authSetting: {}, authorize }), transient);
        const next = jest.fn(async () => {});
        await permission({ scopeFor })(ctx(p, 'getFuzzyLocation'), next);
        expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ scope: 'scope.userFuzzyLocation' }));
    });

    it('自定义 scopeFor 覆盖默认', async () => {
        const authorize = jest.fn((opts: any) => opts.success());
        const p = createProvider(nativeWith({ authSetting: {}, authorize }), transient);
        const next = jest.fn(async () => {});
        await permission({ scopeFor: () => 'scope.userLocationBackground' })(ctx(p, 'getFuzzyLocation'), next);
        expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ scope: 'scope.userLocationBackground' }));
    });
});
