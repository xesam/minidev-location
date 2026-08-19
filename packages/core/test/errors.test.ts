import { LocationError } from '../src/errors';

describe('LocationError', () => {
    it('携带 code / message / raw 字段', () => {
        const e = new LocationError('TIMEOUT', 'getLocation:fail timeout', { errMsg: 'x' });
        expect(e).toBeInstanceOf(LocationError);
        expect(e).toBeInstanceOf(Error);
        expect(e.code).toBe('TIMEOUT');
        expect(e.message).toBe('getLocation:fail timeout');
        expect(e.raw).toEqual({ errMsg: 'x' });
        expect(e.name).toBe('LocationError');
    });

    it('raw 可选', () => {
        const e = new LocationError('CANCELLED', 'x');
        expect(e.raw).toBeUndefined();
    });

    it.each(['TIMEOUT', 'CANCELLED', 'UNSUPPORTED', 'PERMISSION_DENIED', 'PERMISSION_BLOCKED'] as const)(
        'code %s 合法',
        (code) => {
            const e = new LocationError(code, 'm');
            expect(e.code).toBe(code);
        }
    );
});
