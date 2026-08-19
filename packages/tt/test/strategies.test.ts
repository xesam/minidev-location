import { isTransientError } from '../src/strategies';

describe('tt isTransientError — errMsg 文本判定', () => {
    const cases: [string, any, boolean][] = [
        ['auth deny 终态', { errMsg: 'getLocation:fail auth deny' }, false],
        ['permission 终态', { errMsg: 'getLocation permission deny' }, false],
        ['not support 终态', { errMsg: 'not support' }, false],
        ['cancel 终态', { errMsg: 'getLocation:fail cancel' }, false],
        ['timeout 终态', { errMsg: 'timeout' }, false],
        ['network 可重试', { errMsg: 'getLocation:fail network' }, true],
        ['空 errMsg 可重试', { errMsg: '' }, true],
        ['无 errMsg 可重试', {}, true]
    ];
    it.each(cases)('tt: %s', (_name, err, expected) => {
        expect(isTransientError(err)).toBe(expected);
    });

    it('对 null/undefined err 视为可重试（?.短路兜底）', () => {
        expect(isTransientError(null as any)).toBe(true);
        expect(isTransientError(undefined as any)).toBe(true);
    });
});
