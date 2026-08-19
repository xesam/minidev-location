import { isTransientError } from '../src/strategies';

describe('my isTransientError — error 数字码判定', () => {
    const cases: [string, any, boolean][] = [
        ['error 11 终态', { error: 11 }, false],
        ['error 2001 终态', { error: 2001 }, false],
        ['error 2002 终态', { error: 2002 }, false],
        ['error 2003 终态', { error: 2003 }, false],
        ['error 2004 终态', { error: 2004 }, false],
        ['error 12 可重试', { error: 12 }, true],
        ['error 13 可重试', { error: 13 }, true],
        ['error 14 可重试', { error: 14 }, true],
        ['无 error 可重试', {}, true]
    ];
    it.each(cases)('my: %s', (_name, err, expected) => {
        expect(isTransientError(err)).toBe(expected);
    });

    it('对 null/undefined err 视为可重试（?.短路兜底）', () => {
        expect(isTransientError(null as any)).toBe(true);
        expect(isTransientError(undefined as any)).toBe(true);
    });
});
