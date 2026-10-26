import Handlebars from 'handlebars';
import deckTemplate from '../templates/deck.hbs';
import sortingTemplate from '../templates/hand-sorting.hbs';
import translations from '../lang/en.json';

const labels = {
    'TYPES.Item.feature': 'Features',
    'TYPES.Item.weapon': 'Weapons',
    'TYPES.Item.armor': 'Armor',
    'TYPES.Item.domainCard': 'Domain Cards',
    'DAGGERHEART.GENERAL.Tabs.potentialAdversaries': 'Potential Adversaries'
};
const localize = key => labels[key] ?? key.split('.').reduce((data, part) => data?.[part], translations) ?? key;
Handlebars.registerHelper('localize', localize);
const templates = new Map([
    ['deck.hbs', Handlebars.compile(deckTemplate)],
    ['hand-sorting.hbs', Handlebars.compile(sortingTemplate)]
]);

// Only Foundry's host boundary is supplied here; templates, cards, settings and application handlers are real.
globalThis.foundry = {
    applications: { api: {
        ApplicationV2: class {
            constructor() {
                const config = this.constructor.DEFAULT_OPTIONS;
                this.element = document.createElement(config.tag ?? 'div');
                this.element.id = config.id;
                this.element.className = (config.classes ?? []).join(' ');
                this.parts = {};
                if (config.id === 'dh-card-deck') {
                    this.element.classList.add('alternate-positioning', 'position-center');
                    this.element.innerHTML = templates.get('deck.hbs')({});
                    this.parts.deck = this.element.firstElementChild;
                } else this.element.classList.add('fixture-settings-window');
                document.body.append(this.element);
                this.element.addEventListener('click', event => {
                    const target = event.target.closest('[data-action]');
                    const action = config.actions?.[target?.dataset.action];
                    if (action) action.call(this, event, target);
                });
                if (config.form) this.element.addEventListener('submit', async event => {
                    event.preventDefault();
                    await config.form.handler.call(this, event, this.element);
                    if (config.form.closeOnSubmit) await this.close();
                });
            }
            async _prepareContext() { return {}; }
            async _onFirstRender() {}
            async _onRender() {}
            async _onClose() {}
            _attachPartListeners() {}
            async _preparePartContext(part, context) { return context; }
            async close() { await this._onClose({}); this.element.remove(); }
            async render(options = {}) {
                const parts = options.parts ?? Object.keys(this.constructor.PARTS);
                const context = await this._prepareContext(options);
                for (const part of parts) {
                    const partContext = await this._preparePartContext(part, { ...context }, options);
                    const path = this.constructor.PARTS[part].template.split('/').at(-1);
                    const container = document.createElement('div');
                    container.innerHTML = templates.get(path)(partContext);
                    const element = container.firstElementChild;
                    if (this.parts[part]?.isConnected) this.parts[part].replaceWith(element);
                    else this.element.append(element);
                    this.parts[part] = element;
                    this._attachPartListeners(part, element, options);
                }
                if (!this.rendered) await this._onFirstRender(context, options);
                this.rendered = true;
                await this._onRender(context, { ...options, parts });
                return this;
            }
        },
        HandlebarsApplicationMixin: Base => Base
    } },
    utils: {
        randomID: () => crypto.randomUUID(),
        debounce: (callback, delay) => {
            let timer;
            const debounced = (...args) => {
                clearTimeout(timer);
                timer = setTimeout(() => callback(...args), delay);
            };
            debounced.cancel = () => clearTimeout(timer);
            return debounced;
        }
    }
};
const hooks = new Map();
globalThis.Hooks = {
    on: (name, handler) => {
        if (!hooks.has(name)) hooks.set(name, []);
        hooks.get(name).push(handler);
    },
    once: (name, handler) => Hooks.on(name, handler),
    callAll: (name, ...args) => { for (const handler of hooks.get(name) ?? []) handler(...args); }
};
globalThis.canvas = { tokens: { controlled: [] } };
globalThis._loc = localize;
globalThis.ui = { notifications: {
    error: message => window.errors.push(message), warn: message => window.warnings.push(message)
} };
globalThis.getDocumentClass = () => ({
    getSpeaker: ({ actor }) => ({ actor: actor.id }),
    create: async message => { window.messages.push(message); }
});
globalThis.fromUuidSync = uuid => window.documents.get(uuid);
globalThis.Item = { TYPES: [] };
globalThis.game = { user: { id: 'fixture-user', character: null }, settings: {
    register: (module, key, setting) => {
        settings.set(key, setting.default);
        definitions.set(key, setting);
    },
    registerMenu: (module, key, config) => menus.set(key, config),
    get: (module, key) => settings.get(key),
    set: async (module, key, value) => {
        settings.set(key, value);
        await definitions.get(key)?.onChange?.(value);
    }
} };

const settings = new Map();
const definitions = new Map();
const menus = new Map();
window.errors = [];
window.warnings = [];
window.chats = [];
window.messages = [];
window.openedDocuments = [];
window.documents = new Map();
window.uses = 0;

const { DHCardDeckHUD } = await import('../src/applications/daggerheart-card-deck-hud');
const { default: DHDeck } = await import('../src/applications/deck');
const { default: FeatureSelectionDialog } = await import('../src/applications/dialogs/feature-selection-dialog');
const { registerSettings } = await import('../src/system/settings');
registerSettings();
const hud = new DHCardDeckHUD();
DHCardDeckHUD.instance = hud;
const actor = {
    id: 'fixture-actor', type: 'adversary', system: {}, items: [],
    sheet: { render: async () => window.openedDocuments.push('Actor.fixture-actor') }
};
actor.items.get = id => actor.items.find(item => item.id === id);
hud.createDeck = async () => {
    if (!hud.deck) return;
    hud.deck.itemTypes = hud.deck._getItemTypes();
    await hud.deck.createCards();
    await hud.render({ parts: ['deck'] });
};
await hud.setActor(actor);
const deck = new DHDeck(actor, hud);
hud.deck = deck;

async function populate(count = 5) {
    actor.items.length = 0;
    for (let index = 0; index < count; index++) {
        const uuid = `Actor.fixture-actor.Item.card-${index}`;
        const item = {
            id: `card-${index}`, uuid, actor, type: 'feature',
            system: {
                actionsList: [{ id: 'fixture-action' }],
                toEmbed: async () => {
                    const embed = document.createElement('div');
                    embed.className = 'dh-card';
                    embed.innerHTML = `<header class="dh-card-header"></header><article><header>Card ${index + 1}</header><p>A Daggerheart action, ready to play.</p></article>`;
                    return embed;
                }
            },
            use: async () => { window.uses++; },
            toChat: async origin => { window.chats.push(origin); },
            sheet: { render: async () => window.openedDocuments.push(uuid) }
        };
        actor.items.push(item);
        window.documents.set(uuid, item);
    }
    await deck.createCards();
}

await populate();
await hud.render({ parts: ['deck'] });
await import('../src/daggerheart-card-deck-hud');

function createActor(id, count = 2, type = 'character') {
    const actor = {
        id, uuid: `Actor.${id}`, type, items: [],
        system: {
            class: { value: null, subclass: null },
            multiclass: { value: null, subclass: null },
            domainCards: { loadout: [], vault: [] }
        },
        sheet: { render: async () => window.openedDocuments.push(`Actor.${id}`) }
    };
    actor.items.get = itemId => actor.items.find(item => item.id === itemId);
    for (let index = 0; index < count; index++) {
        const uuid = `Actor.${id}.Item.card-${index}`;
        const item = {
            id: `card-${index}`, uuid, actor,
            type: type === 'character' ? (index === 0 ? 'weapon' : 'domainCard') : 'feature',
            system: {
                actionsList: [{ id: 'fixture-action' }],
                toEmbed: async () => {
                    window.embedRequests.push(id);
                    if (actor.embedGate) await actor.embedGate;
                    const embed = document.createElement('div');
                    embed.className = 'dh-card';
                    embed.innerHTML = `<header class="dh-card-header"></header><article><header>${id} card ${index + 1}</header><p>A Daggerheart action.</p></article>`;
                    return embed;
                }
            },
            use: async () => { window.uses++; },
            toChat: async origin => { window.chats.push(origin); },
            sheet: { render: async () => window.openedDocuments.push(uuid) }
        };
        actor.items.push(item);
        window.documents.set(uuid, item);
    }
    if (type === 'character') {
        actor.system.primaryWeapon = actor.items[0];
        actor.system.domainCards.loadout = actor.items.slice(1);
    }
    return actor;
}
window.embedRequests = [];
window.fixture = {
    hud, deck, populate, FeatureSelectionDialog, createActor, HUD: DHCardDeckHUD,
    set: (key, value) => game.settings.set('daggerheart-card-deck-hud', key, value),
    settings: Object.fromEntries(settings),
    get: key => settings.get(key),
    openSorting: () => new (menus.get('handSorting').type)().render({ force: true }),
    setFreePosition: () => {
        settings.set('deckPosition', 'custom');
        hud.element.classList.replace('position-center', 'position-custom');
        hud.element.style.left = '300px';
        hud.element.style.top = '400px';
    },
    resetCards: async count => {
        hud.interactions.reset();
        await populate(count);
        await hud.render({ parts: ['deck'] });
    }
};
