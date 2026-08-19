// koa-compose 不自带类型声明，也未收录 @types，这里补一份最小声明。
// 仅类型层面，无运行时代码；ctx 类型由调用点（Interceptor[]）推断为 LocationContext。
declare module 'koa-compose' {
    type Middleware<S> = (ctx: S, next: () => Promise<void>) => Promise<void>;
    function compose<S>(middlewares: Middleware<S>[]): (ctx: S) => Promise<void>;
    export default compose;
}
