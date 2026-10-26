const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.fixture);
});

async function setting(page, key, value) {
    await page.evaluate(([key, value]) => window.fixture.set(key, value), [key, value]);
}

async function dragCard(page, x = 450, y = 250) {
    const card = page.locator('#dh-card-deck .dh-card-wrapper').last();
    const box = await card.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 35);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 12 });
}

test('idle collapse observes its delay, keeps cards visible and restores on hover', async ({ page }) => {
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await setting(page, 'autoHideDelay', 2);
    await setting(page, 'autoHideDistance', 120);
    await setting(page, 'autoHide', true);
    const hud = page.locator('#dh-card-deck');
    await page.clock.fastForward(1999);
    await expect(hud).not.toHaveClass(/is-auto-collapsed/);
    await page.clock.fastForward(1);
    await expect(hud).toHaveClass(/is-auto-collapsed/);
    await expect(page.locator('.dh-cd-cards')).toHaveCSS('opacity', '1');
    await page.clock.fastForward(400);
    await expect.poll(async () => page.locator('.dh-cd-cards').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m42))
        .toBeCloseTo(120, 0);
    await page.locator('.dh-cd-controls button').first().hover();
    await expect(hud).not.toHaveClass(/is-auto-collapsed/);
    await page.mouse.move(50, 50);
    await page.clock.fastForward(2000);
    await expect(hud).toHaveClass(/is-auto-collapsed/);
    await setting(page, 'autoHide', false);
    await expect(hud).not.toHaveClass(/is-auto-collapsed/);
});

test('hover resets the timer and selected cards or an open menu prevent collapse', async ({ page }) => {
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await setting(page, 'autoHideDelay', 1);
    await setting(page, 'autoHide', true);
    await page.clock.fastForward(900);
    await page.locator('.dh-cd-controls button').first().hover();
    await page.mouse.move(40, 40);
    await page.clock.fastForward(900);
    await expect(page.locator('#dh-card-deck')).not.toHaveClass(/is-auto-collapsed/);
    await page.evaluate(() => {
        window.fixture.hud._selectCard([...window.fixture.deck.cards.values()][0]);
    });
    await page.clock.fastForward(3000);
    await expect(page.locator('#dh-card-deck')).not.toHaveClass(/is-auto-collapsed/);
    await page.evaluate(() => window.fixture.hud._selectCard());
    await page.locator('[data-action="toggleMenu"]').click();
    await page.mouse.move(40, 40);
    await page.clock.fastForward(3000);
    await expect(page.locator('#dh-card-deck')).not.toHaveClass(/is-auto-collapsed/);
    await page.locator('[data-action="toggleMenu"]').click();
    await page.mouse.move(40, 40);
    await page.clock.fastForward(1000);
    await expect(page.locator('#dh-card-deck')).toHaveClass(/is-auto-collapsed/);
});

test('a large collapse distance preserves a card edge that reopens the hand', async ({ page }) => {
    await setting(page, 'autoHideDelay', 0);
    await setting(page, 'autoHideDistance', 600);
    await setting(page, 'autoHide', true);
    await expect(page.locator('#dh-card-deck')).toHaveClass(/is-auto-collapsed/);
    const middleCard = page.locator('#dh-card-deck .dh-card-wrapper').nth(2);
    await expect.poll(async () => (await middleCard.boundingBox()).y).toBeGreaterThan(700);
    const box = await middleCard.boundingBox();
    expect(box.y).toBeLessThan(770);
    await page.mouse.move(box.x + box.width / 2, box.y + 5);
    await expect(page.locator('#dh-card-deck')).not.toHaveClass(/is-auto-collapsed/);
});

test('manual collapse fully hides an already auto-collapsed hand and can restore it', async ({ page }) => {
    await setting(page, 'autoHideDelay', 0);
    await setting(page, 'autoHide', true);
    await expect(page.locator('#dh-card-deck')).toHaveClass(/is-auto-collapsed/);
    await expect.poll(async () => page.locator('.dh-cd-cards').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m42))
        .toBeCloseTo(180, 0);
    // Call the same action directly to preserve the collapsed position at the start of the animation.
    await page.evaluate(() => {
        const hud = window.fixture.hud;
        hud.constructor.DEFAULT_OPTIONS.actions.toggleHUD.call(hud);
    });
    await expect(page.locator('#dh-card-deck')).toHaveClass(/is-hidden/);
    await expect.poll(async () => (await page.locator('.dh-cd-cards').boundingBox()).y).toBeGreaterThan(800);
    await setting(page, 'autoHide', false);
    await page.locator('[data-action="toggleHUD"]').click();
    await expect(page.locator('#dh-card-deck')).not.toHaveClass(/is-hidden/);
    await expect.poll(async () => page.locator('.dh-cd-cards').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m42))
        .toBeCloseTo(0, 0);
});

test('curvature includes zero and scales the fan without NaN for two cards', async ({ page }) => {
    await page.evaluate(() => window.fixture.resetCards(2));
    for (const curvature of [0, 50, 100, 200]) {
        await setting(page, 'deckCurvature', curvature);
        const values = await page.locator('.dh-card-wrapper').first().evaluate(el => ({
            y: parseFloat(el.style.getPropertyValue('--translate-y')),
            rotate: parseFloat(el.style.getPropertyValue('--rotate')),
            transform: getComputedStyle(el).transform
        }));
        expect(values.y).toBe(20 * curvature / 100);
        expect(values.rotate).toBeCloseTo(-14 * curvature / 100);
        expect(values.transform).not.toContain('NaN');
    }
    await setting(page, 'deckStyle', 'flat');
    await expect(page.locator('.dh-cd-cards')).toHaveClass(/flat/);
});

test('hover enlargement can be disabled independently of its configured scale', async ({ page }) => {
    await setting(page, 'hoverScale', 1.8);
    await expect(page.locator('.dh-cd-cards')).toHaveCSS('--hover-scale-value', '1.8');
    await setting(page, 'hoverScaleEnabled', false);
    await expect(page.locator('.dh-cd-cards')).toHaveCSS('--hover-scale-value', '1');
    await setting(page, 'hoverScaleEnabled', true);
    await expect(page.locator('.dh-cd-cards')).toHaveCSS('--hover-scale-value', '1.8');
});

test('light, dark and automatic themes update card text and surfaces', async ({ page }) => {
    const card = page.locator('#dh-card-deck .dh-card').first();
    await setting(page, 'cardTheme', 'light');
    await expect(card).toHaveCSS('background-color', 'rgb(245, 241, 232)');
    await expect(card).toHaveCSS('color', 'rgb(37, 34, 56)');
    await setting(page, 'cardTheme', 'dark');
    await expect(card).toHaveCSS('background-color', 'rgb(16, 18, 23)');
    await expect(card).toHaveCSS('color', 'rgb(239, 230, 216)');
    await setting(page, 'cardTheme', 'auto');
    await page.evaluate(() => { document.documentElement.style.colorScheme = 'light'; });
    await expect(card).toHaveCSS('background-color', 'rgb(245, 241, 232)');
    await page.evaluate(() => { document.documentElement.style.colorScheme = 'dark'; });
    await expect(card).toHaveCSS('background-color', 'rgb(16, 18, 23)');
});

test('dragging to the canvas plays exactly once and removes its animation layer', async ({ page }) => {
    await dragCard(page);
    await expect(page.locator('.dh-card-play-layer')).toHaveClass(/can-play/);
    await expect(page.locator('.is-drag-source')).toHaveCount(1);
    expect(await page.evaluate(() => window.getSelection().toString())).toBe('');
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.uses)).toBe(1);
    await expect(page.locator('.dh-card-play-layer')).toHaveCount(0);
    await expect(page.locator('.is-drag-source')).toHaveCount(0);
    await expect(page.locator('#dh-card-deck .dh-card')).toHaveCount(5);
    expect(await page.evaluate(() => window.errors)).toEqual([]);
});

test('Escape and dropping on the sidebar return the card without using it', async ({ page }) => {
    await dragCard(page);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.locator('.dh-card-play-layer')).toHaveCount(0);
    await dragCard(page, 1200, 250);
    await expect(page.locator('.dh-card-play-layer')).not.toHaveClass(/can-play/);
    await page.mouse.up();
    await expect(page.locator('.dh-card-play-layer')).toHaveCount(0);
    expect(await page.evaluate(() => window.uses)).toBe(0);
    await expect(page.locator('.is-drag-source')).toHaveCount(0);
});

test('disabled dragging and locked cards do not extract cards', async ({ page }) => {
    await setting(page, 'dragToPlay', false);
    await dragCard(page);
    await expect(page.locator('.dh-card-play-layer')).toHaveCount(0);
    await page.mouse.up();
    await setting(page, 'dragToPlay', true);
    await page.evaluate(() => {
        const card = [...window.fixture.deck.cards.values()].at(-1);
        Object.defineProperty(card, 'isLocked', { get: () => true });
    });
    await dragCard(page);
    await expect(page.locator('.dh-card-play-layer')).toHaveCount(0);
    await page.mouse.up();
    expect(await page.evaluate(() => window.uses)).toBe(0);
});

test('changing actors or destroying the HUD cancels a pending play and idle timer', async ({ page }) => {
    await dragCard(page);
    await page.mouse.up();
    await page.evaluate(() => window.fixture.hud.clearActor());
    await expect(page.locator('.dh-card-play-layer')).toHaveCount(0);
    expect(await page.evaluate(() => window.uses)).toBe(0);
    await page.evaluate(() => window.fixture.hud.close());
    await expect(page.locator('#dh-card-deck')).toHaveCount(0);
});

test('reduced motion still plays a card and exposes selected-card actions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => {
        window.fixture.hud._selectCard([...window.fixture.deck.cards.values()][0]);
    });
    await expect(page.locator('.selected')).toHaveClass(/show-actions/);
    await dragCard(page);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.uses)).toBe(1);
});
