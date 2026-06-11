// Three real browser tabs share a mine: lobby flow, cross-tab world changes,
// and refresh-rejoin. Reads window.__game instead of pixels.

import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __game: any;
  }
}

async function phase(page: Page): Promise<string> {
  return page.evaluate(() => window.__game?.phase ?? 'boot');
}

async function joinAs(page: Page, name: string, code?: string): Promise<void> {
  await page.goto(code ? `/?room=${code}` : '/');
  await page.fill('#jn-name', name);
  if (code) {
    await page.fill('#jn-code', code);
    await page.click('#jn-join');
  } else {
    await page.click('#jn-create');
  }
  await page.waitForFunction(() => window.__game?.code?.length === 4, undefined, { timeout: 15000 });
}

test('three tabs play in one mine', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ctxC = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const c = await ctxC.newPage();

  await joinAs(a, 'Alice');
  const code: string = await a.evaluate(() => window.__game.code);
  expect(code).toMatch(/^[A-Z]{4}$/);

  await joinAs(b, 'Bob', code);
  await joinAs(c, 'Carol', code);

  // everyone sees the full lobby
  await a.waitForFunction(() => window.__game.roster.filter((r: any) => r.connected).length === 3);

  // host starts; intro plays; then we are mining
  await a.click('#lb-start');
  await a.waitForFunction(() => window.__game.phase === 'playing', undefined, { timeout: 20000 });
  await b.waitForFunction(() => window.__game.phase === 'playing', undefined, { timeout: 20000 });

  // Alice walks right: Bob sees Alice's dwarf move
  const before = await b.evaluate(() => {
    const me = window.__game.myEid;
    const others = [...window.__game.dwarfs.values()].filter((d: any) => d.eid !== me);
    return others.map((d: any) => ({ eid: d.eid, x: d.x1 }));
  });
  await a.keyboard.down('d');
  await a.waitForTimeout(1200);
  await a.keyboard.up('d');
  await a.waitForTimeout(400);
  const moved = await b.evaluate((prev: { eid: number; x: number }[]) => {
    const byEid = new Map(prev.map((p) => [p.eid, p.x]));
    return [...window.__game.dwarfs.values()].some(
      (d: any) => byEid.has(d.eid) && Math.abs(d.x1 - byEid.get(d.eid)!) > 0.8
    );
  }, before);
  expect(moved).toBe(true);

  // Alice digs straight down; Carol's world updates at that tile
  const target = await a.evaluate(() => {
    const me = [...window.__game.dwarfs.values()].find((d: any) => d.eid === window.__game.myEid);
    return { x: Math.floor(me.x1), y: Math.floor(me.y1 + 0.01) };
  });
  await a.keyboard.down('s');
  await a.keyboard.press('e');
  await a.waitForTimeout(900);
  await a.keyboard.up('s');
  const dug = await c.waitForFunction(
    (t: { x: number; y: number }) => {
      const W = 96;
      return window.__game.tiles[t.y * W + t.x] === 0;
    },
    target,
    { timeout: 10000 }
  );
  expect(dug).toBeTruthy();

  // screenshot for the humans
  await a.screenshot({ path: 'test-results/ingame.png' });

  // Bob refreshes mid-round and lands back in the same slot automatically
  const slotBefore = await b.evaluate(() => window.__game.you.slot);
  await b.reload();
  await b.waitForFunction(() => window.__game?.phase === 'playing', undefined, { timeout: 15000 });
  const slotAfter = await b.evaluate(() => window.__game.you.slot);
  expect(slotAfter).toBe(slotBefore);

  await ctxA.close();
  await ctxB.close();
  await ctxC.close();
});

test('join screen renders and validates', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.title')).toContainText('MOLE IN THE MINE');
  await page.click('#jn-create');
  await expect(page.locator('#jn-err')).toContainText('name');
  await page.screenshot({ path: 'test-results/join.png' });
});
