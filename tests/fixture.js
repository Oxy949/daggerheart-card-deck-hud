// The browser fixture supplies Foundry's host boundary; card, deck, HUD and settings code are real.
globalThis.foundry = {
    applications: { api: {
        ApplicationV2: class {
            constructor() {
                this.element = document.createElement('div');
                this.element.id = 'dh-card-deck';
                this.element.className = 'daggerheart dh-style alternate-positioning position-center';
                this.element.innerHTML = '<div class="dh-cd-cards"></div><div class="dh-cd-controls"><button>Hand</button><button data-action="toggleHUD">Collapse</button><button data-action="toggleMenu">Menu</button><div class="dh-cd-control-settings-menu">Card types</div></div>';
                this.parts = {
                    deck: this.element.querySelector('.dh-cd-cards'),
                    controls: this.element.querySelector('.dh-cd-controls')
                };
                document.body.append(this.element);
                this.element.addEventListener('click', event => {
                    const target = event.target.closest('[data-action]');
                    const action = this.constructor.DEFAULT_OPTIONS.actions[target?.dataset.action];
                    if (action) action.call(this, event, target);
                });
            }
            async _onFirstRender() {}
            async _onRender() {}
            async _onClose() {}
            async _preparePartContext(part, context) { return context; }
            async close() { await this._onClose({}); this.element.remove(); }
            async render(options) { await this._onRender({}, options); }
        },
        HandlebarsApplicationMixin: Base => Base
    } },
    utils: { randomID: () => crypto.randomUUID() }
};
globalThis._loc = key => key;
globalThis.ui = { notifications: {
    error: message => window.errors.push(message), warn: () => {}
} };
globalThis.Item = { TYPES: [] };
globalThis.game = { settings: {
    register: (module, key, setting) => {
        settings.set(key, setting.default);
        definitions.set(key, setting);
    },
    get: (module, key) => settings.get(key),
    set: async (module, key, value) => {
        settings.set(key, value);
        await definitions.get(key)?.onChange?.(value);
    }
} };

const settings = new Map();
const definitions = new Map();
window.errors = [];
window.uses = 0;

const { DHCardDeckHUD } = await import('../src/applications/daggerheart-card-deck-hud');
const { default: DHDeck } = await import('../src/applications/deck');
const { default: DHCard } = await import('../src/applications/card');
const { registerSettings } = await import('../src/system/settings');
registerSettings();
const hud = new DHCardDeckHUD();
DHCardDeckHUD.instance = hud;
const actor = { type: 'adversary', system: {}, items: [] };
// Avoid system embed templates: use real card models with representative native embed markup.
hud.createDeck = async () => {};
await hud.setActor(actor);
const deck = new DHDeck(actor, hud);
hud.deck = deck;

function populate(count = 5) {
    deck.cards.clear();
    for (let index = 0; index < count; index++) {
        const item = { actor, system: { actionsList: [] }, use: async () => { window.uses++; } };
        const card = new DHCard(item, index);
        const wrapper = document.createElement('div');
        wrapper.className = 'dh-card-wrapper';
        wrapper.dataset.cardId = card.id;
        wrapper.dataset.action = 'useCard';
        wrapper.innerHTML = `<div class="dh-card"><header class="dh-card-header"></header><article><header>Card ${index + 1}</header><p>A Daggerheart action, ready to play.</p></article></div><div class="hover-layout"></div>`;
        card.element = wrapper;
        deck.cards.set(card.id, card);
    }
    hud.parts.deck.replaceChildren(...[...deck.cards.values()].map(card => card.element));
    deck.updateCardPosition();
}

populate();
await hud._onFirstRender({}, {});
await hud._onRender({}, { parts: ['deck'] });
window.fixture = {
    hud, deck, populate,
    set: (key, value) => game.settings.set('daggerheart-card-deck-hud', key, value),
    settings: Object.fromEntries(settings),
    resetCards: async count => {
        hud.interactions.reset();
        populate(count);
        await hud._onRender({}, { parts: ['deck'] });
    }
};
