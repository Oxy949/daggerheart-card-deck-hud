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

async function hoverCard(page) {
    const box = await page.locator('#dh-card-deck .dh-card').nth(2).boundingBox();
    await page.mouse.move(box.x + box.width / 4, box.y + 20);
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
    await hoverCard(page);
    await expect(hud).not.toHaveClass(/is-auto-collapsed/);
    await page.evaluate(() => {
        for (const animation of window.fixture.hud.parts.deck.getAnimations()) {
            if (animation.transitionProperty === 'transform') animation.finish();
        }
    });
    await page.mouse.move(50, 50);
    await page.clock.fastForward(2000);
    await expect(hud).toHaveClass(/is-auto-collapsed/);
    await setting(page, 'autoHide', false);
    await expect(hud).not.toHaveClass(/is-auto-collapsed/);
});

test('hover resets the timer and selected cards prevent collapse', async ({ page }) => {
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await setting(page, 'autoHideDelay', 1);
    await setting(page, 'autoHide', true);
    await page.clock.fastForward(900);
    await hoverCard(page);
    await page.mouse.move(40, 40);
    await page.clock.fastForward(900);
    await expect(page.locator('#dh-card-deck')).not.toHaveClass(/is-auto-collapsed/);
    await page.evaluate(() => {
        window.fixture.hud._selectCard([...window.fixture.deck.cards.values()][0]);
    });
    await page.clock.fastForward(3000);
    await expect(page.locator('#dh-card-deck')).not.toHaveClass(/is-auto-collapsed/);
    await page.evaluate(() => window.fixture.hud._selectCard());
    await page.clock.fastForward(1000);
    await expect(page.locator('#dh-card-deck')).toHaveClass(/is-auto-collapsed/);
});

for (const distance of [0, 600, 1800, -600]) {
    test(`collapse uses the exact ${distance}px offset`, async ({ page }) => {
        await setting(page, 'autoHideDelay', 0);
        await setting(page, 'autoHideDistance', distance);
        await setting(page, 'autoHide', true);
        const hud = page.locator('#dh-card-deck');
        const hand = page.locator('#dh-card-deck .dh-cd-cards');
        await expect(hud).toHaveClass(/is-auto-collapsed/);
        await expect.poll(() => hand.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m42))
            .toBeCloseTo(distance, 0);
        await setting(page, 'autoHide', false);
        await expect(hud).not.toHaveClass(/is-auto-collapsed/);
        await expect.poll(() => hand.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m42))
            .toBeCloseTo(0, 0);
    });
}

test('only a visible card reopens the hand, not empty panel space', async ({ page }) => {
    await setting(page, 'autoHideDelay', 0);
    await setting(page, 'autoHideDistance', 180);
    await setting(page, 'autoHide', true);
    const hud = page.locator('#dh-card-deck');
    const hand = page.locator('#dh-card-deck .dh-cd-cards');
    await expect.poll(() => hand.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m42))
        .toBeCloseTo(180, 0);

    // A Foundry theme may make the panel itself hit-testable; empty space must still be ignored.
    await hud.evaluate(el => { el.style.pointerEvents = 'auto'; });
    const panel = await hud.boundingBox();
    await page.mouse.move(panel.x + 5, panel.y + 5);
    await expect(hud).toHaveClass(/is-auto-collapsed/);
    await hoverCard(page);
    await expect(hud).not.toHaveClass(/is-auto-collapsed/);
});

test('moving from a card into empty panel space allows the idle collapse', async ({ page }) => {
    await hoverCard(page);
    await setting(page, 'autoHideDelay', 0);
    await setting(page, 'autoHide', true);
    const hud = page.locator('#dh-card-deck');
    await expect(hud).not.toHaveClass(/is-auto-collapsed/);
    await hud.evaluate(el => { el.style.pointerEvents = 'auto'; });
    const box = await hud.boundingBox();
    await page.mouse.move(box.x + 5, box.y + 5);
    await expect(hud).toHaveClass(/is-auto-collapsed/);
});

test('the hand and its cards render without module buttons', async ({ page }) => {
    await expect(page.locator('#dh-card-deck button, #dh-card-deck .card-buttons')).toHaveCount(0);
    await expect(page.locator('#dh-card-deck .dh-cd-controls')).toHaveCount(0);
    await expect(page.locator('#dh-card-deck .dh-card')).toHaveCount(5);
});

test('right-click opens the original item without selecting or using it', async ({ page }) => {
    await page.locator('#dh-card-deck .dh-card-wrapper').last().click({ button: 'right' });
    expect(await page.evaluate(() => window.openedDocuments)).toEqual(['Actor.fixture-actor.Item.card-4']);
    expect(await page.evaluate(() => window.uses)).toBe(0);
    expect(await page.evaluate(() => window.chats)).toEqual([]);
    await expect(page.locator('#dh-card-deck .selected')).toHaveCount(0);
});

test('right-click on a subclass rank opens its owning item document', async ({ page }) => {
    await page.evaluate(() => {
        const card = [...window.fixture.deck.cards.values()].at(-1);
        card.item = { ...card.item, type: 'subclass', featureState: 2, sheet: undefined };
    });
    await page.locator('#dh-card-deck .dh-card-wrapper').last().click({ button: 'right' });
    expect(await page.evaluate(() => window.openedDocuments)).toEqual(['Actor.fixture-actor.Item.card-4']);
});

test('right-click on synthetic cards resolves their source document or actor', async ({ page }) => {
    await page.evaluate(() => {
        const card = [...window.fixture.deck.cards.values()].at(-1);
        const uuid = 'Actor.fixture-actor.ActiveEffect.beastform';
        window.documents.set(uuid, { sheet: { render: async () => window.openedDocuments.push(uuid) } });
        card.item = { actor: card.actor, id: 'beastform-effect', uuid, system: {} };
    });
    await page.locator('#dh-card-deck .dh-card-wrapper').last().click({ button: 'right' });
    await page.evaluate(() => {
        const card = [...window.fixture.deck.cards.values()].at(-1);
        card.item = { actor: card.actor, id: 'base-attack', uuid: 'base-attack', system: {} };
    });
    await page.locator('#dh-card-deck .dh-card-wrapper').last().click({ button: 'right' });
    expect(await page.evaluate(() => window.openedDocuments)).toEqual([
        'Actor.fixture-actor.ActiveEffect.beastform', 'Actor.fixture-actor'
    ]);
});

test('Alt-drag moves a freely positioned hand without playing a card', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => window.fixture.setFreePosition());
    await page.keyboard.down('Alt');
    await dragCard(page, 550, 250);
    await page.mouse.up();
    await page.keyboard.up('Alt');
    const position = await page.evaluate(() => window.fixture.get('deckCustomPosition'));
    expect(position.top).toBeLessThan(400);
    expect(position.left).toBeGreaterThanOrEqual(0);
    expect(await page.evaluate(() => window.uses)).toBe(0);
    await expect(page.locator('.dh-card-play-layer')).toHaveCount(0);
});

test('the position lock prevents moving the hand with Alt-drag', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => window.fixture.setFreePosition());
    await setting(page, 'lockPosition', true);
    const before = await page.locator('#dh-card-deck').boundingBox();
    await page.keyboard.down('Alt');
    await dragCard(page, 550, 250);
    await page.mouse.up();
    await page.keyboard.up('Alt');
    const after = await page.locator('#dh-card-deck').boundingBox();
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(await page.evaluate(() => window.uses)).toBe(0);
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

async function pauseHandExpansion(page) {
    await setting(page, 'hoverScale', 1.8);
    await setting(page, 'autoHideDelay', 0);
    await setting(page, 'autoHideDistance', 180);
    await setting(page, 'autoHide', true);
    const hand = page.locator('#dh-card-deck .dh-cd-cards');
    await expect.poll(() => hand.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m42))
        .toBeCloseTo(180, 0);
    await hoverCard(page);
    await page.evaluate(() => {
        const animation = window.fixture.hud.parts.deck.getAnimations()
            .find(animation => animation.transitionProperty === 'transform');
        animation.pause();
        animation.currentTime = animation.effect.getTiming().duration / 2;
        window.handExpansion = animation;
    });
}

async function cardScales(page) {
    return page.locator('#dh-card-deck .dh-card-wrapper').evaluateAll(cards => cards.map(card => {
        const matrix = new DOMMatrix(getComputedStyle(card).transform);
        return Math.round(Math.hypot(matrix.a, matrix.b) * 10000) / 10000;
    }));
}

test('hover transforms wait until the hand has finished expanding', async ({ page }) => {
    await pauseHandExpansion(page);
    await page.mouse.move(40, 40);
    await hoverCard(page);
    // Finish any individual card transitions while keeping the hand halfway through its slide.
    await page.evaluate(() => {
        for (const card of window.fixture.deck.cards.values()) {
            for (const animation of card.element.getAnimations()) animation.finish();
        }
    });
    await expect(page.locator('#dh-card-deck .hover-layout:hover')).toHaveCount(1);
    expect(await cardScales(page)).toEqual([1, 1, 1, 1, 1]);
    await expect(page.locator('#dh-card-deck')).not.toHaveClass(/is-auto-collapsed/);
    await page.evaluate(() => window.handExpansion.finish());
    await expect.poll(async () => Math.max(...await cardScales(page))).toBeCloseTo(1.8, 3);
});

test('rebuilding the hand during expansion restores normal hover behavior', async ({ page }) => {
    await pauseHandExpansion(page);
    await page.evaluate(() => window.fixture.resetCards(5));
    await hoverCard(page);
    await expect(page.locator('#dh-card-deck')).not.toHaveClass(/is-expanding/);
    await expect.poll(async () => Math.max(...await cardScales(page))).toBeCloseTo(1.8, 3);
});

for (const { distance, reducedMotion } of [
    { distance: 0, reducedMotion: 'no-preference' },
    { distance: 120, reducedMotion: 'reduce' }
]) {
    test(`hover works without an expansion transition (${distance}px, ${reducedMotion})`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion });
        await setting(page, 'hoverScale', 1.8);
        await setting(page, 'autoHideDelay', 0);
        await setting(page, 'autoHideDistance', distance);
        await setting(page, 'autoHide', true);
        await expect(page.locator('#dh-card-deck')).toHaveClass(/is-auto-collapsed/);
        await hoverCard(page);
        await expect(page.locator('#dh-card-deck')).not.toHaveClass(/is-expanding/);
        await expect.poll(async () => Math.max(...await cardScales(page))).toBeCloseTo(1.8, 3);
    });
}

test('light, dark and automatic themes update card text and surfaces', async ({ page }) => {
    const card = page.locator('#dh-card-deck .dh-card').first();
    await setting(page, 'cardTheme', 'light');
    await expect(card).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(card).toHaveCSS('color', 'rgb(0, 0, 0)');
    await setting(page, 'cardTheme', 'dark');
    await expect(card).toHaveCSS('background-color', 'rgb(16, 18, 23)');
    await expect(card).toHaveCSS('color', 'rgb(239, 230, 216)');
    await setting(page, 'cardTheme', 'auto');
    await page.evaluate(() => { document.documentElement.style.colorScheme = 'light'; });
    await expect(card).toHaveCSS('background-color', 'rgb(255, 255, 255)');
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
    expect(await page.evaluate(() => window.chats)).toEqual([]);
});

for (const actions of ['empty array', 'empty collection', 'missing']) {
    test(`playing a card with ${actions} actions posts it to chat once`, async ({ page }) => {
        await page.evaluate(actions => {
            const card = [...window.fixture.deck.cards.values()].at(-1);
            card.item.system = actions === 'missing' ? {} : {
                actionsList: actions === 'empty array' ? [] : new Map()
            };
        }, actions);
        await dragCard(page);
        await page.mouse.up();
        await expect.poll(() => page.evaluate(() => window.chats)).toEqual(['Actor.fixture-actor.Item.card-4']);
        expect(await page.evaluate(() => window.uses)).toBe(0);
        expect(await page.evaluate(() => window.warnings)).toEqual([]);
        expect(await page.evaluate(() => window.errors)).toEqual([]);
        await expect(page.locator('.is-drag-source')).toHaveCount(0);
    });
}

test('an available linked feature is used instead of posting the card to chat', async ({ page }) => {
    await page.evaluate(() => {
        const card = [...window.fixture.deck.cards.values()].at(-1);
        card.item.system.actionsList = [];
        card.item.use = () => { throw new Error('The parent has no actions'); };
        card.features = [{
            system: { actionsList: [{ id: 'feature-action' }] },
            use: async () => { window.uses++; }
        }];
    });
    await dragCard(page);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.uses)).toBe(1);
    expect(await page.evaluate(() => window.chats)).toEqual([]);
    expect(await page.evaluate(() => window.errors)).toEqual([]);
});

test('cancelling feature selection does not post the card to chat', async ({ page }) => {
    await page.evaluate(() => {
        const card = [...window.fixture.deck.cards.values()].at(-1);
        card.item.system.actionsList = [];
        card.features = [0, 1].map(id => ({
            system: { actionsList: [{ id }] },
            use: async () => { window.uses++; }
        }));
        window.fixture.FeatureSelectionDialog.create = async () => null;
    });
    await dragCard(page);
    await page.mouse.up();
    await expect(page.locator('.dh-card-play-layer')).toHaveCount(0);
    expect(await page.evaluate(() => window.uses)).toBe(0);
    expect(await page.evaluate(() => window.chats)).toEqual([]);
});

test('custom companion and environment actions remain usable with an empty actions list', async ({ page }) => {
    await page.evaluate(() => {
        const card = [...window.fixture.deck.cards.values()].at(-1);
        card.item.system.actionsList = [];
        card.item.noButton = true;
    });
    await dragCard(page);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.uses)).toBe(1);
    expect(await page.evaluate(() => window.chats)).toEqual([]);
});

test('a subclass rank without actions posts its original item to chat', async ({ page }) => {
    await page.evaluate(() => {
        const card = [...window.fixture.deck.cards.values()].at(-1);
        card.item.system.actionsList = [];
        card.item = { ...card.item, type: 'subclass', featureState: 1, toChat: undefined, use: undefined };
    });
    await dragCard(page);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.chats)).toEqual(['Actor.fixture-actor.Item.card-4']);
    expect(await page.evaluate(() => window.errors)).toEqual([]);
});

test('a synthetic card without actions posts its embed without secret content', async ({ page }) => {
    await page.evaluate(() => {
        const card = [...window.fixture.deck.cards.values()].at(-1);
        card.item = { actor: card.actor, type: 'beastform', system: {} };
        const secret = document.createElement('section');
        secret.className = 'secret';
        secret.textContent = 'Hidden GM note';
        card.element.querySelector('.dh-card').append(secret);
    });
    await dragCard(page);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.messages.length)).toBe(1);
    const message = await page.evaluate(() => window.messages[0]);
    expect(message.speaker.actor).toBe('fixture-actor');
    expect(message.content).toContain('Card 5');
    expect(message.content).not.toContain('Hidden GM note');
    expect(message.content).not.toContain('hover-layout');
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

test('returning a card to its hidden slot cancels the play', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => window.fixture.resetCards(1));
    const card = page.locator('#dh-card-deck .dh-card-wrapper');
    const box = await card.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await dragCard(page);
    await page.mouse.move(x, y, { steps: 12 });
    // The hidden placeholder allows canvas hit testing through it; this is still part of the hand.
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y).id, [x, y])).toBe('board');
    await expect(page.locator('.dh-card-play-layer')).not.toHaveClass(/can-play/);
    await page.mouse.up();
    await expect(page.locator('.dh-card-play-layer')).toHaveCount(0);
    await expect(card).toBeVisible();
    expect(await page.evaluate(() => window.uses)).toBe(0);
});

test('dropping in empty space between cards cancels the play', async ({ page }) => {
    const hand = await page.locator('#dh-card-deck .dh-cd-cards').boundingBox();
    await dragCard(page);
    await page.mouse.move(hand.x + 5, hand.y + 5, { steps: 12 });
    await expect(page.locator('.dh-card-play-layer')).not.toHaveClass(/can-play/);
    await page.mouse.up();
    await expect(page.locator('.dh-card-play-layer')).toHaveCount(0);
    expect(await page.evaluate(() => window.uses)).toBe(0);
});

test('a played card fades back into the hand', async ({ page }) => {
    await dragCard(page);
    await page.mouse.up();
    await page.waitForFunction(() => {
        const card = [...document.querySelectorAll('#dh-card-deck .dh-card-wrapper')].at(-1);
        const fade = card.getAnimations().find(animation => animation.effect.getKeyframes()[0].opacity === '0');
        if (!fade) return false;
        fade.pause();
        fade.currentTime = 0;
        window.returnFade = fade;
        return true;
    });
    const card = page.locator('#dh-card-deck .dh-card-wrapper').last();
    await expect(card).not.toHaveClass(/is-drag-source/);
    await expect(card).toHaveCSS('opacity', '0');
    await page.evaluate(() => { window.returnFade.currentTime = 150; });
    await expect.poll(() => card.evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0);
    await expect.poll(() => card.evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThan(1);
    await page.evaluate(() => window.returnFade.finish());
    await expect(card).toHaveCSS('opacity', '1');
    expect(await page.evaluate(() => window.uses)).toBe(1);
});

test('the return fade continues if a resource update rebuilds the hand', async ({ page }) => {
    await page.evaluate(() => {
        const card = [...window.fixture.deck.cards.values()].at(-1);
        card.item.use = async () => {
            window.uses++;
            await window.fixture.resetCards(5);
        };
    });
    await dragCard(page);
    await page.mouse.up();
    await page.waitForFunction(() => {
        const card = [...document.querySelectorAll('#dh-card-deck .dh-card-wrapper')].at(-1);
        const fade = card.getAnimations().find(animation => animation.effect.getKeyframes().at(-1).opacity === '1');
        if (window.uses !== 1 || !fade) return false;
        fade.pause();
        window.returnFade = fade;
        return true;
    });
    const card = page.locator('#dh-card-deck .dh-card-wrapper').last();
    await expect.poll(() => card.evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThan(1);
    await page.evaluate(() => window.returnFade.finish());
    await expect(card).toHaveCSS('opacity', '1');
    await expect(page.locator('.dh-card-play-layer')).toHaveCount(0);
    expect(await page.evaluate(() => window.errors)).toEqual([]);
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

test('reduced motion still supports playing cards and opening their documents', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#dh-card-deck .dh-card-wrapper').last().click({ button: 'right' });
    expect(await page.evaluate(() => window.openedDocuments)).toEqual(['Actor.fixture-actor.Item.card-4']);
    await dragCard(page);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.uses)).toBe(1);
});
