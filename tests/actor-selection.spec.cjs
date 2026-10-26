const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.fixture);
    await page.evaluate(() => { delete window.fixture.hud.createDeck; });
});

async function expectActor(page, id) {
    await expect.poll(() => page.evaluate(() => window.fixture.HUD.instance?.actor?.id ?? null)).toBe(id);
    await expect(page.locator('#dh-card-deck')).not.toHaveClass(/is-switching-actors/);
}

async function pauseSlide(page, direction, progress = 0.5) {
    await page.waitForFunction(({ direction, progress }) => {
        const animation = window.fixture.HUD.instance.parts.deck?.getAnimations()
            .find(animation => animation.id === `dh-hand-${direction}`);
        if (!animation) return false;
        animation.pause();
        animation.currentTime = animation.effect.getTiming().duration * progress;
        window.currentSlide = animation;
        return true;
    }, { direction, progress });
}

test('startup uses the assigned character when no token is selected', async ({ page }) => {
    await page.evaluate(async () => {
        game.user.character = window.fixture.createActor('assigned');
        await window.fixture.HUD.destroy();
        Hooks.callAll('ready');
    });
    await expectActor(page, 'assigned');
    await expect(page.locator('#dh-card-deck .dh-card')).toHaveCount(2);
    await expect(page.locator('#dh-card-deck')).toContainText('assigned card');
    expect(await page.evaluate(() => window.fixture.HUD.instance.token)).toBe(null);
});

test('a selected token takes priority and deselection restores the assigned hand', async ({ page }) => {
    await page.evaluate(async () => {
        game.user.character = window.fixture.createActor('assigned');
        const actor = window.fixture.createActor('selected');
        const token = { id: 'selected-token', actor };
        canvas.tokens.controlled = [token];
        await window.fixture.HUD.destroy();
        window.fixture.hud = await window.fixture.HUD.create();
    });
    await expectActor(page, 'selected');
    expect(await page.evaluate(() => window.fixture.hud.token.id)).toBe('selected-token');
    await page.evaluate(() => {
        const token = canvas.tokens.controlled[0];
        canvas.tokens.controlled = [];
        Hooks.callAll('controlToken', token, false);
    });
    await expectActor(page, 'assigned');
    await expect(page.locator('#dh-card-deck')).toContainText('assigned card');
});

test('deselecting the assigned character does not reload or animate the same hand', async ({ page }) => {
    await page.evaluate(async () => {
        const actor = game.user.character = window.fixture.createActor('assigned');
        const token = { id: 'own-token', actor };
        canvas.tokens.controlled = [token];
        await window.fixture.hud.setActor(actor, token);
    });
    const firstId = await page.locator('#dh-card-deck .dh-card-wrapper').first().getAttribute('data-card-id');
    await page.evaluate(() => {
        const token = canvas.tokens.controlled[0];
        canvas.tokens.controlled = [];
        Hooks.callAll('controlToken', token, false);
    });
    await expect.poll(() => page.evaluate(() => window.fixture.hud.token)).toBe(null);
    await expect(page.locator('#dh-card-deck .dh-card-wrapper').first()).toHaveAttribute('data-card-id', firstId);
    await expectActor(page, 'assigned');
});

test('assignment changes and scene readiness update the fallback hand', async ({ page }) => {
    await page.evaluate(() => {
        game.user.character = window.fixture.createActor('first-assigned');
        Hooks.callAll('canvasReady');
    });
    await expectActor(page, 'first-assigned');
    await page.evaluate(() => {
        game.user.character = window.fixture.createActor('new-assigned');
        Hooks.callAll('updateUser', game.user, { character: 'new-assigned' });
    });
    await expectActor(page, 'new-assigned');
    await page.evaluate(() => {
        game.user.character = null;
        Hooks.callAll('updateUser', game.user, { character: null });
    });
    await expectActor(page, null);
    await expect(page.locator('#dh-card-deck')).toBeHidden();
});

test('multiple selected tokens do not show an arbitrary actor or the fallback hand', async ({ page }) => {
    await page.evaluate(() => {
        game.user.character = window.fixture.createActor('assigned');
        canvas.tokens.controlled = [
            { actor: window.fixture.createActor('first') },
            { actor: window.fixture.createActor('second') }
        ];
        Hooks.callAll('controlToken', canvas.tokens.controlled[1], true);
    });
    await expectActor(page, null);
    await expect(page.locator('#dh-card-deck')).toBeHidden();
});

test('actor switching slides the old hand down before the new hand enters', async ({ page }) => {
    const oldTop = await page.locator('#dh-card-deck .dh-cd-cards').evaluate(el => el.getBoundingClientRect().top);
    await page.evaluate(() => {
        window.switchDone = window.fixture.hud.setActor(window.fixture.createActor('next'));
    });
    await pauseSlide(page, 'out');
    await expect(page.locator('#dh-card-deck .dh-card')).toHaveCount(5);
    await expect(page.locator('#dh-card-deck')).toContainText('Card 5');
    const leavingTop = await page.locator('#dh-card-deck .dh-cd-cards').evaluate(el => el.getBoundingClientRect().top);
    expect(leavingTop).toBeGreaterThan(oldTop);
    await page.evaluate(() => window.currentSlide.finish());
    await pauseSlide(page, 'in', 0);
    const hand = page.locator('#dh-card-deck .dh-cd-cards');
    await expect(page.locator('#dh-card-deck .dh-card')).toHaveCount(2);
    await expect(page.locator('#dh-card-deck')).toContainText('next card');
    expect(await hand.evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThan(800);
    await expect(hand).toHaveCSS('opacity', '0');
    await page.evaluate(() => {
        window.currentSlide.currentTime = window.currentSlide.effect.getTiming().duration / 2;
    });
    const opacity = await hand.evaluate(el => Number(getComputedStyle(el).opacity));
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
    await page.evaluate(() => window.currentSlide.finish());
    await page.evaluate(() => window.switchDone);
    await expectActor(page, 'next');
    await expect(hand).toHaveCSS('opacity', '1');
});

test('rapid selection changes use the latest target after the outgoing animation', async ({ page }) => {
    await page.evaluate(() => {
        window.firstSwitch = window.fixture.hud.setActor(window.fixture.createActor('skipped'));
    });
    await pauseSlide(page, 'out');
    await page.evaluate(() => {
        window.latestSwitch = window.fixture.hud.setActor(window.fixture.createActor('latest'));
        window.currentSlide.finish();
    });
    await page.evaluate(() => Promise.all([window.firstSwitch, window.latestSwitch]));
    await expectActor(page, 'latest');
    expect(await page.evaluate(() => window.embedRequests)).not.toContain('skipped');
});

test('a slow superseded load cannot block or overwrite a newer selection', async ({ page }) => {
    await page.evaluate(() => {
        const actor = window.fixture.createActor('slow');
        actor.embedGate = new Promise(resolve => { window.releaseSlow = resolve; });
        window.slowSwitch = window.fixture.hud.setActor(actor);
    });
    await expect.poll(() => page.evaluate(() => window.embedRequests.includes('slow'))).toBe(true);
    await page.evaluate(() => window.fixture.hud.setActor(window.fixture.createActor('fast')));
    await expectActor(page, 'fast');
    await page.evaluate(async () => {
        window.releaseSlow();
        await window.slowSwitch;
    });
    await expectActor(page, 'fast');
    await expect(page.locator('#dh-card-deck')).not.toContainText('slow card');
});

test('an earlier resource refresh cannot replace a newly selected actor', async ({ page }) => {
    await page.evaluate(async () => {
        const actor = window.firstActor = window.fixture.createActor('original');
        await window.fixture.hud.setActor(actor);
        window.embedRequests = [];
        actor.embedGate = new Promise(resolve => { window.releaseRefresh = resolve; });
        window.staleRefresh = window.fixture.hud.createDeck();
    });
    await expect.poll(() => page.evaluate(() => window.embedRequests.includes('original'))).toBe(true);
    await page.evaluate(() => window.fixture.hud.setActor(window.fixture.createActor('replacement')));
    await page.evaluate(async () => {
        window.releaseRefresh();
        await window.staleRefresh;
    });
    await expectActor(page, 'replacement');
    await expect(page.locator('#dh-card-deck')).toContainText('replacement card');
});

test('ordinary item updates refresh the current hand without a character-switch animation', async ({ page }) => {
    await page.evaluate(async () => {
        await window.fixture.hud.setActor(window.fixture.createActor('current'));
        window.switchCount = 0;
        new MutationObserver(() => {
            if (window.fixture.hud.isSwitchingActors) window.switchCount++;
        }).observe(window.fixture.hud.element, { attributes: true, attributeFilter: ['class'] });
    });
    const first = page.locator('#dh-card-deck .dh-card-wrapper').first();
    const oldId = await first.getAttribute('data-card-id');
    await page.evaluate(() => Hooks.callAll('updateItem', window.fixture.hud.actor.items[0]));
    await expect(first).not.toHaveAttribute('data-card-id', oldId);
    expect(await page.evaluate(() => window.switchCount)).toBe(0);
    await expectActor(page, 'current');
});

test('reduced motion switches immediately and closing during a load cancels the transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => window.fixture.hud.setActor(window.fixture.createActor('reduced')));
    await expectActor(page, 'reduced');
    expect(await page.locator('#dh-card-deck .dh-cd-cards').evaluate(el => el.getAnimations().length)).toBe(0);
    await page.evaluate(() => {
        const actor = window.fixture.createActor('pending');
        actor.embedGate = new Promise(resolve => { window.releaseClosed = resolve; });
        window.pendingSwitch = window.fixture.hud.setActor(actor);
    });
    await expect.poll(() => page.evaluate(() => window.embedRequests.includes('pending'))).toBe(true);
    await page.evaluate(async () => {
        await window.fixture.hud.close();
        await window.pendingSwitch;
        window.releaseClosed();
    });
    await expect(page.locator('#dh-card-deck')).toHaveCount(0);
});
