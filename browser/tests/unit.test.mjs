/* 不需要浏览器的部分：选下一项、参数解析、节奏、平台提示 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { human } from '../src/human.mjs';
import { createPointer } from '../src/pointer.mjs';
import { parseArgs, defaults } from '../src/config.mjs';
import { isAllowedUrl } from '../src/selectors.mjs';
import { LearningRunner, keyEntries, pickNext } from '../src/learning.mjs';
import { createLogger } from '../src/logger.mjs';
import { chromeLaunchHint } from '../src/platform.mjs';
import { launchOptions } from '../src/browser.mjs';

const silent = createLogger('silent');
const leaf = (kind, title, extra = {}) => ({ type: 'leaf', kind, title, done: false, active: false, ...extra });
const node = (title) => ({ type: 'node', title });

test('选下一项：越过已完成的和课堂，取第一个没完成的视频', () => {
    const entries = keyEntries([
        leaf('视频', 'A', { active: true }),
        leaf('视频', 'B', { done: true }),
        leaf('课堂', 'C'),
        leaf('视频', 'D'),
    ]);
    assert.equal(pickNext(entries).target.title, 'D');
});

test('选下一项：折叠的知识点排在前面时先展开它', () => {
    /* 实测：折叠节点下的学习项不渲染，不展开就永远看不到 */
    const entries = keyEntries([leaf('视频', 'A', { active: true }), node('二、折叠的'), leaf('视频', 'D')]);
    const first = pickNext(entries);
    assert.equal(first.target.type, 'node');
    const second = pickNext(entries, { expanded: new Set([first.target.key]) });
    assert.equal(second.target.title, 'D', '展开过的节点不再展开第二次');
});

test('选下一项：后面都没有了就回到前面；这一轮开过的不再开', () => {
    const entries = keyEntries([leaf('图文', 'R'), leaf('视频', 'A', { active: true }), leaf('视频', 'B', { done: true })]);
    const picked = pickNext(entries);
    assert.equal(picked.target.title, 'R');
    assert.equal(picked.wrapped, true);
    assert.equal(pickNext(entries, { attempted: new Set([picked.target.key]) }).target, null);
    assert.equal(pickNext(entries, { articles: false }).target, null, '--no-articles 时图文不算');
});

test('同名条目的 key 互不相同，并且插入新条目后不变', () => {
    const before = keyEntries([leaf('视频', '同名'), leaf('视频', '同名')]);
    assert.notEqual(before[0].key, before[1].key);
    const after = keyEntries([leaf('视频', '同名'), leaf('视频', '新插入'), leaf('视频', '同名')]);
    assert.equal(after[2].key, before[1].key);
});

test('参数：默认静音、看图文；--no-mute / --no-articles / --max-items', () => {
    assert.equal(parseArgs([]).config.mute, true);
    assert.equal(parseArgs([]).config.articles, true);
    assert.equal(parseArgs(['--no-mute']).config.mute, false);
    assert.equal(parseArgs(['--no-articles']).config.articles, false);
    assert.equal(parseArgs(['--max-items', '2']).config.maxItems, 2);
    assert.throws(() => parseArgs(['--max-itmes', '2']), /无法识别/);
});

test('只接受 yuketang.cn 的地址', () => {
    assert.equal(isAllowedUrl('https://changjiang.yuketang.cn/ai-workspace/lms-graph/1/video/2'), true);
    assert.equal(isAllowedUrl('https://yuketang.cn.evil.com/'), false);
    assert.equal(isAllowedUrl('file:///etc/passwd'), false);
});

test('启动提示和 launch 模式都在浏览器这一层静音', () => {
    assert.match(chromeLaunchHint(9222), /--mute-audio/);
    assert.match(chromeLaunchHint(9222), /yuketang-chrome/);
    assert.ok(launchOptions().args.includes('--mute-audio'));
    assert.equal(launchOptions({ mute: false }).args.includes('--mute-audio'), false);
    assert.ok(launchOptions().ignoreDefaultArgs.includes('--enable-automation'));
    assert.equal(launchOptions().headless, false);
});

test('指针微动的间隔铺满配置区间, 不被轮询压成固定节拍', async () => {
    const realNow = Date.now;
    let now = 1_000_000;
    Date.now = () => now;
    try {
        const fired = [];
        const runner = new LearningRunner({
            page: {},
            pointer: { async drift() { fired.push(now); } },
            config: { ...defaults, idleActivityMs: [18000, 55000] },
            log: silent,
        });
        for (let t = 0; t < 4 * 3600 * 1000; t += 1200) {
            now += 1200;
            await runner.maybeDrift();
        }
        const gaps = fired.slice(1).map((at, i) => (at - fired[i]) / 1000);
        const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        assert.ok(mean > 32 && mean < 41, `平均间隔应在区间中部, 实际 ${mean.toFixed(1)} 秒`);
        assert.ok(gaps.filter((g) => g > 45).length > gaps.length * 0.15, '应当有相当比例的长间隔');
    } finally {
        Date.now = realNow;
    }
});

test('播放中页面被关掉: 如实停下, 不算这一项完成', async () => {
    const page = {
        isClosed: () => true,
        locator: () => ({ first: () => ({ evaluate: async () => { throw new Error('Target page, context or browser has been closed'); } }) }),
    };
    const runner = new LearningRunner({ page, pointer: {}, config: { ...defaults, pollIntervalMs: 5 }, log: silent });
    assert.equal(await runner.watchUntilEnd(), 'stopped');
    assert.equal(runner.stopped, true);
    assert.equal(runner.itemsDone, 0);
});

test('目录暂时读不到（平台重新渲染）时等一会儿再读，不一次失败就停', async () => {
    let calls = 0;
    const page = {
        async evaluate() {
            calls += 1;
            if (calls < 3) throw new Error('Execution context was destroyed');
            return [{ type: 'leaf', index: 0, kind: '视频', title: 'A', done: false, active: true }];
        },
    };
    const runner = new LearningRunner({ page, pointer: {}, config: defaults, log: silent });
    const entries = await runner.readCatalogSettled(5000);
    assert.equal(entries.length, 1);
    assert.equal(calls, 3);
});

test('播放中但在缓冲时只等着，不去点播放键；缓冲太久才停下', async () => {
    /* 实测: readyState 1、seeking、paused 为 false, 约 50 秒后自己恢复 */
    const realNow = Date.now;
    let now = 1_000_000;
    Date.now = () => now;
    try {
        const state = { currentTime: 0, duration: 1861, paused: false, ended: false, muted: true, readyState: 1, seeking: true };
        const page = { isClosed: () => false, locator: () => ({ first: () => ({ evaluate: async () => { now += 1300; return { ...state }; } }) }) };
        const runner = new LearningRunner({ page, pointer: { async drift() {} }, config: { ...defaults, pollIntervalMs: 1, idleActivity: false }, log: silent });
        let clicks = 0;
        runner.startPlayback = async () => { clicks += 1; return true; };
        assert.equal(await runner.watchUntilEnd(), 'stopped');
        assert.equal(clicks, 0, '缓冲中不应去点播放键');
        assert.ok(now - 1_000_000 >= defaults.bufferingTimeoutMs, '应当等满缓冲超时才停');
    } finally {
        Date.now = realNow;
    }
});

test('等待时长会抖动；指针起点是 (0,0)', () => {
    const values = new Set();
    for (let i = 0; i < 40; i += 1) values.add(human.ms(1000));
    assert.ok(values.size > 15);
    const pointer = createPointer({ viewportSize: () => ({ width: 1280, height: 800 }), mouse: {} });
    assert.deepEqual([pointer.state.x, pointer.state.y], [0, 0]);
});
