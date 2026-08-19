// Drives each sample through the real built library with mocked platform globals.
//
// Monorepo 布局下：示例直接依赖三件——平台包（如 @mini-dev/location-wx，workspace:* → packages/wx）、
// 核心 @mini-dev/location（workspace:* → packages/core）、koa-compose（catalog:）。原因：微信「构建 npm」
// 只处理示例顶层 node_modules 里的包，不钻进 pnpm 嵌套 node_modules 找传递依赖；若核心 / koa-compose
// 不是示例直接依赖，就不会被构建进 miniprogram_npm，运行时 require 会回退到相对路径而失败。
// 运行前需 `pnpm install`（填充示例 node_modules 的 workspace 软链）+ `pnpm run build`（产出各包 dist）。
// 脚本把临时入口写进示例目录，使 require('@mini-dev/location-wx') 能从示例 node_modules 解析到 packages/wx/dist。
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅ ' + m); };
const bad = (m) => { fail++; console.log('  ❌ ' + m); };

let tmpCounter = 0;

const REPO = path.resolve(__dirname, '..');

// 示例名 → 该示例应直接依赖的平台包。运行期三件（平台包 + @mini-dev/location + koa-compose）
// 都必须在示例 package.json 的 dependencies 里声明，否则微信「构建 npm」不会构建进 miniprogram_npm。
const SAMPLES = [
    { name: 'wechat', dir: 'sample-location-wechat', platformPkg: '@mini-dev/location-wx', platformGlobal: 'wx' },
    { name: 'alipay', dir: 'sample-location-alipay', platformPkg: '@mini-dev/location-my', platformGlobal: 'my' },
    { name: 'douyin', dir: 'sample-location-douyin', platformPkg: '@mini-dev/location-tt', platformGlobal: 'tt' }
];

function checkSampleDeps(sample) {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, sample.dir, 'package.json'), 'utf8'));
    const deps = pkg.dependencies || {};
    const required = [sample.platformPkg, '@mini-dev/location', 'koa-compose'];
    for (const d of required) {
        if (!deps[d]) bad(`[${sample.name}] package.json 缺少直接依赖 ${d}——微信「构建 npm」不递归 pnpm 嵌套 node_modules，运行期三件都必须在示例顶层声明`);
        else ok(`[${sample.name}] 直接依赖 ${d}`);
    }
}

function clearPackageCache() {
    for (const k of Object.keys(require.cache)) {
        // 清掉库产物缓存：示例软链路径（含 @mini-dev/location）与 realpath（packages/<pkg>/dist）
        if (k.includes('@mini-dev/location') || /packages[/](core|wx|my|tt)[/]dist[/]/.test(k)) {
            delete require.cache[k];
        }
    }
}

function loadSample(sampleDir, srcPath, platformGlobal, behavior) {
    clearPackageCache();
    let pageDef = null;
    global.Page = (def) => { pageDef = def; };
    globalThis[platformGlobal] = {
        getLocation: (opts) => {
            if (behavior === 'fail') opts.fail({ errMsg: 'getLocation:fail auth deny' });
            else opts.success({ latitude: 39.9, longitude: 116.4, accuracy: 10, errMsg: 'getLocation:ok' });
        },
        getSetting: (opts) => opts.success({ authSetting: {} }),
        authorize: (opts) => opts.success && opts.success(),
        openSetting: () => {},
        showModal: () => {},
        alert: () => {},
    };
    let code = fs.readFileSync(srcPath, 'utf8');
    code = code.replace(/^import\s+\{([^}]+)\}\s+from\s+(['"][^'"]+['"]);/gm, 'const {$1} = require($2);');
    // 临时入口写进示例目录，使 require('@mini-dev/location-<platform>') 从示例 node_modules 解析
    const tmp = path.join(sampleDir, `.verify-sample-${tmpCounter++}.cjs`);
    fs.writeFileSync(tmp, code);
    try { require(tmp); ok(`[${behavior}] module loaded, Page registered`); }
    catch (e) { bad(`[${behavior}] load failed: ` + e.message); fs.unlinkSync(tmp); return null; }
    fs.unlinkSync(tmp);
    return pageDef;
}

async function drive(sample) {
    const { name, dir, platformGlobal } = sample;
    const sampleDir = path.join(REPO, dir);
    const srcPath = path.join(sampleDir, 'pages/index/index.js');
    console.log('== ' + name + ' ==');
    checkSampleDeps(sample);
    // success path (fresh singleton, first call, no cache)
    {
        const page = loadSample(sampleDir, srcPath, platformGlobal, 'success');
        if (!page) return;
        const mockThis = { data: {}, setData(o) { Object.assign(this.data, o); }, onLog(t) { this.data.result = t; } };
        await page.onTapGetLocation.call(mockThis);
        /39\.9.*116\.4/.test(mockThis.data.result) ? ok('onTapGetLocation success: ' + mockThis.data.result) : bad('success result: ' + mockThis.data.result);
        typeof page.onTapPermission === 'function' ? ok('onTapPermission present') : bad('onTapPermission missing');
        (page.onTapWatchStart === undefined && page.data.watching === undefined) ? ok('watchLocation removed') : bad('watch leaked');
    }
    // error path (fresh singleton, first call fails — no cache hit)
    {
        const page = loadSample(sampleDir, srcPath, platformGlobal, 'fail');
        if (!page) return;
        const mockThis = { data: {}, setData(o) { Object.assign(this.data, o); }, onLog(t) { this.data.result = t; } };
        await page.onTapGetLocation.call(mockThis);
        /失败.*auth deny/.test(mockThis.data.result) ? ok('onTapGetLocation error passthrough: ' + mockThis.data.result) : bad('error result: ' + mockThis.data.result);
    }
}

(async () => {
    for (const sample of SAMPLES) await drive(sample);
    console.log('\n==== SAMPLES: ' + pass + ' passed, ' + fail + ' failed ====');
    process.exit(fail ? 1 : 0);
})();
