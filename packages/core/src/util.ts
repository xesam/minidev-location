/**
 * 把原生 { success, fail } 回调式 API 转成 Promise：success → resolve(res)，fail → reject(err)。
 * 统一 core 与 permission 中间件对原生回调的处理。
 */
export function promisify<R>(fn: (opts: any) => void, args: Record<string, unknown>): Promise<R> {
    return new Promise<R>((resolve, reject) => {
        fn({ ...args, success: resolve, fail: reject });
    });
}

/**
 * 稳定序列化一个值为字符串：递归按 key 排序，使等价对象（含嵌套对象 / 数组元素中的对象）
 * 产出相同串。用作缓存键，避免 key 顺序差异导致 miss，也避免嵌套对象丢字段导致的碰撞。
 *
 * 注意：旧实现用 `JSON.stringify(obj, Object.keys(obj).sort())`，其 replacer 数组是
 * 递归白名单——对嵌套对象会过滤掉不在顶层 key 列表中的 key，可能丢字段 → 不同参数命中同一缓存。
 */
export function stableKey(value: unknown): string {
    return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(normalize);
    }
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(value as Record<string, unknown>).sort()) {
            out[k] = normalize((value as Record<string, unknown>)[k]);
        }
        return out;
    }
    return value;
}
