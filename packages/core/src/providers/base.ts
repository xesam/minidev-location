import { LocationError } from '../errors';
import type { Provider } from '../types';

/**
 * 通用 Provider 构造器：把一个原生对象按方法名转发成 Provider。平台无关——不绑定具体
 * 平台、不携带 platform 标签、不内置 per-platform 策略；`isTransientError` 判定由调用方
 * （各平台库）传入。缺失的方法置为 undefined，调用方按 UNSUPPORTED 处理。
 *
 * 各平台库在自己的 createXxxProvider 里直接引用本平台全局（wx/my/tt）、注入本平台的
 * isTransientError，再调本函数组装 Provider；getLocation 存在性由本函数兜底校验，
 * 缺失时抛 LocationError(UNSUPPORTED)——与 core 调用期 guard 同一错误形态。
 */
export function createProvider(native: any, isTransientError?: (err: unknown) => boolean): Provider {
    const pick = (name: string) => {
        const fn = native ? native[name] : undefined;
        return typeof fn === 'function' ? fn.bind(native) : undefined;
    };

    const getLocation = pick('getLocation');
    if (typeof getLocation !== 'function') {
        throw new LocationError('UNSUPPORTED', '[@mini-dev/location] getLocation not found');
    }

    return {
        getLocation,
        getFuzzyLocation: pick('getFuzzyLocation'),
        getSetting: pick('getSetting'),
        authorize: pick('authorize'),
        openSetting: pick('openSetting'),
        isTransientError
    };
}
