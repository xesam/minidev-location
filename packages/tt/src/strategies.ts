/**
 * tt（抖音）原生错误「是否值得重试」判定。retry 拦截器在错误非 LocationError 时调用它。
 *
 * 抖音错误形如 `{ errMsg }` 文本（与微信同款）：权限类、不支持、取消、超时均属终态不重试；
 * 其余（网络/定位瞬时失败）可重试。null/undefined 经 ?. 短路兜底为可重试。
 */
export const isTransientError = (err: unknown): boolean =>
    !/auth|deny|permission|not\s*support|cancel|timeout/i.test(String((err as { errMsg?: string } | null | undefined)?.errMsg ?? ''));
