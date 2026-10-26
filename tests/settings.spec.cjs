const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.fixture);
});

test('module settings retain existing type order and visibility for both actor groups', async ({ page }) => {
    await page.evaluate(async () => {
        await window.fixture.set('itemTypes', [{ type: 'weapon', active: true }, { type: 'armor', active: false }]);
        await window.fixture.set('itemTypesNPC', [{ type: 'weapon', active: false }, { type: 'feature', active: true }]);
        await window.fixture.openSorting();
    });
    const characters = page.locator('[data-type-setting="itemTypes"]');
    const npcs = page.locator('[data-type-setting="itemTypesNPC"]');
    await expect(characters.locator('[data-item-type]').first()).toHaveAttribute('data-item-type', 'weapon');
    await expect(characters.locator('[data-item-type="armor"] input')).not.toBeChecked();
    await expect(npcs.locator('[data-item-type]').first()).toHaveAttribute('data-item-type', 'weapon');
    await expect(npcs.locator('[data-item-type="weapon"] input')).not.toBeChecked();
});

test('saved order and visibility update the hand and persist when settings reopen', async ({ page }) => {
    await page.evaluate(async () => {
        window.fixture.hud.actor.items[0].type = 'weapon';
        await window.fixture.hud.createDeck();
        await window.fixture.openSorting();
    });
    const group = page.locator('[data-type-setting="itemTypesNPC"]');
    const weapon = group.locator('[data-item-type="weapon"]');
    await weapon.locator('[data-action="moveTypeUp"]').click();
    await weapon.locator('[data-action="moveTypeUp"]').click();
    await group.locator('[data-item-type="feature"] input').uncheck();
    await page.locator('#dh-hand-sorting button[type="submit"]').click();
    await expect(page.locator('#dh-hand-sorting')).toHaveCount(0);
    await expect(page.locator('#dh-card-deck .dh-card')).toHaveCount(1);
    await expect(page.locator('#dh-card-deck .dh-card')).toContainText('Card 1');
    await page.evaluate(() => window.fixture.openSorting());
    await expect(group.locator('[data-item-type]').first()).toHaveAttribute('data-item-type', 'weapon');
    await expect(group.locator('[data-item-type="feature"] input')).not.toBeChecked();
});

test('dragging rows reorders a group without mixing character and NPC types', async ({ page }) => {
    await page.evaluate(() => window.fixture.openSorting());
    const group = page.locator('[data-type-setting="itemTypes"]');
    const last = group.locator('[data-item-type]').last();
    const movedType = await last.getAttribute('data-item-type');
    const first = group.locator('[data-item-type]').first();
    await last.dragTo(first, { targetPosition: { x: 15, y: 2 } });
    await expect(group.locator('[data-item-type]').first()).toHaveAttribute('data-item-type', movedType);
    await page.locator('#dh-hand-sorting button[type="submit"]').click();
    expect(await page.evaluate(() => window.fixture.get('itemTypes')[0].type)).toBe(movedType);
    expect(await page.evaluate(() => window.fixture.get('itemTypesNPC').length)).toBe(3);
});

test('closing or resetting a draft does not change saved settings before submission', async ({ page }) => {
    await page.evaluate(async () => {
        await window.fixture.set('itemTypes', [{ type: 'weapon', active: true }, { type: 'armor', active: false }]);
        window.sorting = await window.fixture.openSorting();
    });
    await page.locator('[data-action="resetOrder"]').click();
    expect(await page.evaluate(() => window.fixture.get('itemTypes'))).toEqual([
        { type: 'weapon', active: true }, { type: 'armor', active: false }
    ]);
    await page.evaluate(() => window.sorting.close());
    await page.evaluate(() => window.fixture.openSorting());
    await expect(page.locator('[data-type-setting="itemTypes"] [data-item-type]').first())
        .toHaveAttribute('data-item-type', 'weapon');
});

test('the hand view setting retains vault and equipment access without HUD controls', async ({ page }) => {
    const result = await page.evaluate(() => {
        const { hud, deck } = window.fixture;
        hud.actor.type = 'character';
        hud.actor.system.domainCards = { vault: [hud.actor.items[0]] };
        hud.actor.items[1].system.equipped = false;
        return { defaultVault: hud.isVault, defaultEquipment: hud.isEquipment, count: deck.cards.size };
    });
    expect(result.defaultVault).toBe(false);
    expect(result.defaultEquipment).toBe(false);
    await page.evaluate(async () => {
        await window.fixture.set('handView', 'vault');
    });
    await expect(page.locator('#dh-card-deck .dh-card')).toHaveCount(1);
    await expect(page.locator('#dh-card-deck .dh-card')).toContainText('Card 1');
    await page.evaluate(() => window.fixture.set('handView', 'equipment'));
    await expect(page.locator('#dh-card-deck .dh-card')).toHaveCount(1);
    await expect(page.locator('#dh-card-deck .dh-card')).toContainText('Card 2');
});
