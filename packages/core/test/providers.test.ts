import { createProvider } from '../src/providers/base';

const transient = () => true;

describe('createProvider', () => {
    it('映射全部方法并透传调用到 native', () => {
        const native = {
            getLocation: jest.fn(),
            getFuzzyLocation: jest.fn(),
            getSetting: jest.fn(),
            authorize: jest.fn(),
            openSetting: jest.fn()
        };
        const p = createProvider(native, transient);
        expect(typeof p.getLocation).toBe('function');
        expect(typeof p.getFuzzyLocation).toBe('function');
        expect(typeof p.getSetting).toBe('function');
        p.getLocation({ success: () => {} });
        expect(native.getLocation).toHaveBeenCalled();
    });

    it('缺失的可选方法为 undefined', () => {
        const p = createProvider({ getLocation: jest.fn() }, transient);
        expect(p.getFuzzyLocation).toBeUndefined();
        expect(p.getSetting).toBeUndefined();
        expect(p.authorize).toBeUndefined();
        expect(p.openSetting).toBeUndefined();
    });

    it('缺少 getLocation 抛错', () => {
        expect(() => createProvider({}, transient)).toThrow(/getLocation not found/);
    });

    it('native 为空时抛错', () => {
        expect(() => createProvider(undefined as any, transient)).toThrow(
            /getLocation not found/
        );
    });

    it('注入传入的 isTransientError', () => {
        const fn = () => true;
        expect(createProvider({ getLocation: jest.fn() }, fn).isTransientError).toBe(fn);
    });
});
