/**
 * 公共类型定义。本文件只含类型，无运行时代码。
 *
 * 核心：平台无关。不持有 `Platform` 联合类型、不存 platform 标签——平台即平台库本身
 * （@mini-dev/location-wx 等），核心不再在运行时携带任何平台标识。
 */

/** 库源错误码（仅库自身动作）。原生错误不归一、原样透传。 */
export type LocationErrorCode =
    | 'TIMEOUT'
    | 'CANCELLED'
    | 'UNSUPPORTED'
    | 'PERMISSION_DENIED'
    | 'PERMISSION_BLOCKED';

/**
 * 库控制，装在调用选项的保留字段 `ext` 里，与原生参数命名空间隔离。
 * 原生参数直接平铺在调用选项顶层，库只剥掉 `ext` 与 `success`/`fail`/`complete`，
 * 其余原样透传——这样未来原生新增参数也不会与库控制撞名。
 */
export interface ExtControls {
    /** 超时（ms），>0 启用 Promise.race 计时。 */
    timeout?: number;
    /** 缓存有效期（ms），>0 启用缓存。 */
    maxAge?: number;
    /** 仅对瞬态错误的重试次数。 */
    retry?: number;
    /** 取消信号，触发即抛 CANCELLED。 */
    signal?: AbortSignal;
    /** 单次追加拦截器。 */
    interceptors?: Interceptor[];
}

/** 调用选项 = 原生参数平铺 + 保留字段 ext + 原生回调 success/fail/complete。 */
export type LocationOptions = Record<string, unknown> & { ext?: ExtControls };

/** 贯穿中间件的上下文。 */
export interface LocationContext {
    method: 'getLocation' | 'getFuzzyLocation';
    /** 调用者传入的完整入参（含 ext、回调、原生参数）。 */
    options: LocationOptions;
    /** 剥掉 ext/success/fail/complete 后的原生参数，原样喂给原生。 */
    nativeArgs: Record<string, unknown>;
    /** 库控制。 */
    ext: ExtControls;
    provider: Provider;
    /** 原生响应原样存放。 */
    result?: unknown;
    /** 中间件之间自由传值的口袋。 */
    state: Record<string, unknown>;
}

/** 洋葱中间件签名（koa-compose 风格）。 */
export interface Interceptor {
    (ctx: LocationContext, next: () => Promise<void>): Promise<void>;
}

/**
 * Provider：由各平台库构造并注入核心。核心不构造 Provider、不碰 globalThis、
 * 不持有 per-platform 策略。方法入参为透传形（Record），由调用方平铺的原生参数 +
 * promisify 追加的 success/fail 组成。权限相关方法供可选 permission 中间件使用，core 不依赖。
 */
export interface Provider {
    getLocation(args: Record<string, unknown>): void;
    getFuzzyLocation?(args: Record<string, unknown>): void;
    getSetting?(args: {
        success: (res: { authSetting: Record<string, boolean> }) => void;
        fail?: (e: { errMsg: string }) => void;
    }): void;
    authorize?(args: {
        scope: string;
        success?: () => void;
        fail?: (e: { errMsg: string }) => void;
    }): void;
    openSetting?(args: {
        success?: (res: { authSetting: Record<string, boolean> }) => void;
        fail?: (e: { errMsg: string }) => void;
    }): void;
    /** 判定一个原生错误是否值得重试。由平台库构造 Provider 时注入。 */
    isTransientError?(err: unknown): boolean;
}
