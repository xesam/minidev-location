/**
 * my（支付宝）原生错误「是否值得重试」判定。retry 拦截器在错误非 LocationError 时调用它。
 *
 * 支付宝 error 数字码：11=定位权限未开启, 2001=拒绝授权, 2002/2003=总是拒绝, 2004=不再询问；均终态。
 * 12=网络定位失败、13=定位失败、14=基站/WiFi 空 → 可重试。
 * null/undefined 经 ?. 短路兜底为可重试（includes 对 undefined 返回 false）。
 */
export const isTransientError = (err: unknown): boolean =>
    ![11, 2001, 2002, 2003, 2004].includes((err as { error?: number } | null | undefined)?.error as number);
