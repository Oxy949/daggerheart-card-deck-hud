import { DHCardDeckHUD } from './applications/daggerheart-card-deck-hud';
import { registerSettings } from './system/settings';
import { preloadHandlebarsTemplates } from './system/handlebars';
import { MODULE_ID } from './system/constants';
import { getHUDActor } from './system/actor-selection';

Hooks.once('init', async () => {
    preloadHandlebarsTemplates();
    registerSettings();
});

Hooks.once('ready', async () => {
    // Hide Foundry Macro Hotbar if setting checked
    const hidden = game.settings.get(MODULE_ID, 'hideHotbar');
    ui.hotbar?.element?.classList.toggle('hidden', hidden);

    if (!game.settings.get(MODULE_ID, 'disableHUD')) await DHCardDeckHUD.create();
});

const debouncedControl = foundry.utils.debounce(async () => {
    const hud = DHCardDeckHUD.instance;
    if (!hud) return;
    debouncedUpdate.cancel();
    const { actor, token } = getHUDActor();
    await hud.setActor(actor, token);
}, 100);

const debouncedUpdate = foundry.utils.debounce(async object => {
    const actor = object.actor ?? object;
    await refreshHUD(actor);
}, 100);

async function refreshHUD(actor) {
    if (!actor) return;

    const hud = DHCardDeckHUD.instance;
    const requested = hud?.requestedActor;
    if (!requested || (requested.uuid ?? requested.id) !== (actor.uuid ?? actor.id)) return;

    await hud.createDeck();
}

Hooks.on('controlToken', debouncedControl);
Hooks.on('canvasReady', debouncedControl);
Hooks.on('deleteToken', debouncedControl);
Hooks.on('deleteActor', debouncedControl);
Hooks.on('updateUser', (user, changes) => {
    if (user.id === game.user.id && Object.hasOwn(changes, 'character')) debouncedControl();
});

Hooks.on('updateActor', debouncedUpdate);
Hooks.on('createItem', debouncedUpdate);
Hooks.on('updateItem', debouncedUpdate);
Hooks.on('deleteItem', debouncedUpdate);
Hooks.on('deleteActiveEffect', debouncedUpdate);

Hooks.on('renderSettingsConfig', (app, html) => {
    if (!DHCardDeckHUD.instance) return;

    for (const setting of ['autoHideDelay', 'autoHideDistance', 'deckCurvature', 'hoverY', 'hoverScale', 'selectedCardScale']) {
        const slider = html.querySelector(`range-picker[name="${MODULE_ID}.${setting}"]`);
        slider?.addEventListener('input', event => game.settings.set(MODULE_ID, setting, Number(event.target.value)));
    }

    // Deck Border Margin Live Update
    const borderSlider = html.querySelector('range-picker[name="daggerheart-card-deck-hud.deckBorderMargin"]');

    borderSlider?.addEventListener('input', event => {
        const deckBorderMargin = Number(event.target.value);
        DHCardDeckHUD.instance?.updateMarginPosition({deckBorderMargin});
        game.settings.set(MODULE_ID, 'deckBorderMargin', deckBorderMargin);
    });

    // Deck Bottom Margin Live Update
    const bottomSlider = html.querySelector('range-picker[name="daggerheart-card-deck-hud.deckBottomMargin"]');

    bottomSlider?.addEventListener('input', event => {
        const deckBottomMargin = Number(event.target.value);
        DHCardDeckHUD.instance?.updateMarginPosition({deckBottomMargin});
        game.settings.set(MODULE_ID, 'deckBottomMargin', deckBottomMargin);
    });

    // Card Overlap Live Update
    const overlapSlider = html.querySelector('range-picker[name="daggerheart-card-deck-hud.cardOverlap"]');

    overlapSlider?.addEventListener('input', event => {
        const value = Number(event.target.value);
        DHCardDeckHUD.instance?.parts.deck?.setAttribute('data-card-overlap', value);
        DHCardDeckHUD.instance?.deck?.updateCardPosition();
        game.settings.set(MODULE_ID, 'cardOverlap', value);
    });

    // Card Width Live Update
    const widthSlider = html.querySelector('range-picker[name="daggerheart-card-deck-hud.cardWidth"]');

    widthSlider?.addEventListener('input', async event => {
        const value = Number(event.target.value);
        if (!DHCardDeckHUD.instance) return;
        await game.settings.set(MODULE_ID, 'cardWidth', value);
        DHCardDeckHUD.instance.element.style.setProperty('--card-width', `${DHCardDeckHUD.instance.cardWidth}px`);
        if (!DHCardDeckHUD.instance?.deck) return;
        DHCardDeckHUD.instance.deck.updateCardPosition();
        DHCardDeckHUD.instance.deck._setDeckSize();
    });

    // Card Gradient Live Update
    const gradientSlider = html.querySelector('range-picker[name="daggerheart-card-deck-hud.cardGradient"]');

    gradientSlider?.addEventListener('input', event => {
        const value = Number(event.target.value);
        DHCardDeckHUD.instance.deck?.applyGradient(value);
        game.settings.set(MODULE_ID, 'cardGradient', value);
    });
});
