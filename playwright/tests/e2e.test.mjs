/* ------------------------------------------------------------------
 * 端到端：用本机真实 Chrome 跑完整流程
 *
 * 桩页面（fixtures/workspace.html）照真实页面实测的结构搭，并且只接受 isTrusted
 * 的事件，合成事件一律记进 rejected 且不产生效果。所以这里通过就说明：点目录、
 * 展开知识点、点播放、滚轮，全都是浏览器自己构造的可信事件。
 *
 * 需要本机装了 Chrome。没有就跳过，不让 CI 挂掉。
 * ------------------------------------------------------------------ */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { startFixtureServer } from './server.mjs';
import { createPointer } from '../src/pointer.mjs';
import { LearningRunner } from '../src/learning.mjs';
import { createLogger } from '../src/logger.mjs';
import { defaults } from '../src/config.mjs';

const fast = {
    ...defaults,
    startupDelayMs: [40, 120],
    pollIntervalMs: 160,
    itemPauseMs: [60, 160],
    itemLoadMs: [150, 300],
    expandWaitMs: [150, 300],
    guardNoProgressMs: 2500,
    resumeCooldownMs: 900,
    longBreakChance: 0,
    idleActivityMs: [250, 500],
    videoWaitMs: 6000,
    itemSwitchWaitMs: 4000,
    catalogTimeoutMs: 15000,
    articleReadMs: [500, 800],
    articleScrollMs: [150, 300],
};

async function launch() {
    let chromium;
    try {
        ({ chromium } = await import('playwright-core'));
    } catch (e) {
        return { skip: '未安装 playwright-core（在 playwright/ 下执行 npm install）' };
    }
    const profileDir = await mkdtemp(join(tmpdir(), 'ykt-e2e-'));
    try {
        const context = await chromium.launchPersistentContext(profileDir, {
            channel: 'chrome',
            headless: true,
            viewport: { width: 1280, height: 760 },
            ignoreDefaultArgs: ['--enable-automation'],
            args: ['--disable-blink-features=AutomationControlled', '--mute-audio'],
        });
        return { context, profileDir };
    } catch (e) {
        await rm(profileDir, { recursive: true, force: true });
        return { skip: `起不来本机 Chrome：${e.message.split('\n')[0]}` };
    }
}

async function runFixture(t, overrides = {}, query = '') {
    const launched = await launch();
    if (launched.skip) return t.skip(launched.skip);
    const { context, profileDir } = launched;
    const server = await startFixtureServer();
    try {
        const page = await context.newPage();
        await page.goto(server.url + query, { waitUntil: 'domcontentloaded' });
        const pointer = createPointer(page, { x: 0, y: 0 });
        const runner = new LearningRunner({ page, pointer, config: { ...fast, ...overrides }, log: createLogger('silent') });
        await runner.run();
        return { probe: await page.evaluate(() => window.__probe), runner };
    } finally {
        await context.close();
        await server.close();
        await rm(profileDir, { recursive: true, force: true });
    }
}

test('完整流程：放完当前视频，展开折叠的知识点，依次学完后面的，最后回头补前面的图文', async (t) => {
    const out = await runFixture(t);
    if (!out) return;
    const { probe, runner } = out;
    const log = probe.log.join(' | ');
    assert.deepEqual(probe.rejected, [], `出现了不可信事件: ${probe.rejected}`);

    /* 已完成的 V1、课堂 C1/C2 不进去；V3 藏在折叠节点里，要先展开 */
    assert.deepEqual(
        probe.log.filter((e) => e.startsWith('open:') || e.startsWith('expand:')),
        ['open:V2', 'expand:二、折叠着的知识点', 'open:V3', 'open:V4', 'open:A1', 'open:R1'],
        `顺序不对: ${log}`,
    );
    for (const id of ['V2', 'V3', 'V4']) {
        const played = probe.log.indexOf(`play:big:${id}`);
        assert.ok(played >= 0, `${id} 应当真实点大播放按钮起播: ${log}`);
        const muted = probe.log.indexOf(`muted:${id}`);
        assert.ok(muted >= 0 && muted < played, `${id} 应当先静音再起播: ${log}`);
        assert.ok(probe.log.includes(`ended:${id}`), `${id} 应当播完`);
    }
    assert.equal(probe.scriptedPlays, 0, '不应退回 video.play()');
    assert.ok(probe.wheels > 0, '应当用真实滚轮滚过目录或图文');
    assert.equal(runner.itemsDone, 5, '三个视频加两篇图文');
});

test('--no-articles 只看视频，图文不进去', async (t) => {
    const out = await runFixture(t, { articles: false });
    if (!out) return;
    const { probe } = out;
    assert.deepEqual(probe.rejected, []);
    assert.deepEqual(probe.log.filter((e) => e.startsWith('open:')), ['open:V2', 'open:V3', 'open:V4']);
});

test('--max-items 到上限就停在这一项，不先点进下一项', async (t) => {
    const out = await runFixture(t, { maxItems: 1 });
    if (!out) return;
    const { probe, runner } = out;
    assert.deepEqual(probe.log.filter((e) => e.startsWith('open:')), ['open:V2']);
    assert.ok(probe.log.includes('ended:V2'));
    assert.equal(runner.itemsDone, 1);
});

test('--no-mute 时不动静音状态', async (t) => {
    const out = await runFixture(t, { mute: false, maxItems: 1 });
    if (!out) return;
    const { probe } = out;
    assert.ok(probe.log.includes('play:big:V2'));
    assert.equal(probe.log.some((e) => e.startsWith('muted:')), false, `不应静音: ${probe.log.join(' | ')}`);
});

test('当前项已经完成时不重放，直接去下一个没完成的', async (t) => {
    const out = await runFixture(t, { maxItems: 1 }, '?start=V1');
    if (!out) return;
    const { probe } = out;
    assert.equal(probe.log.some((e) => e.endsWith(':V1') && e.startsWith('play:')), false, `不应重放 V1: ${probe.log.join(' | ')}`);
    assert.deepEqual(probe.log.filter((e) => e.startsWith('open:')), ['open:V1', 'open:V2']);
});
