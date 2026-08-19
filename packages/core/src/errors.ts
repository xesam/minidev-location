import type { LocationErrorCode } from './types';

/**
 * 库源错误类型。code 是调用方判断分支的稳定依据。
 *
 * 仅用于库自身动作（超时、取消、方法缺失、权限预判）；**原生错误不归一、原样透传**。
 * 不携带平台标识——平台即平台库本身，消费方装哪个平台库即知是哪个平台。
 */
export class LocationError extends Error {
    code: LocationErrorCode;
    raw?: unknown;

    constructor(code: LocationErrorCode, message: string, raw?: unknown) {
        super(message);
        this.name = 'LocationError';
        this.code = code;
        this.raw = raw;
        // 恢复原型链（ts 编译到 ES5 target 时子类化 Error 会丢链）
        Object.setPrototypeOf(this, LocationError.prototype);
    }
}
