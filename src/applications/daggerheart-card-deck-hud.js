import { MODULE_ID } from '../system/constants';
import DHDeck from './deck';
import HandInteractions from './hand-interactions';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class DHCardDeckHUD extends HandlebarsApplicationMixin(ApplicationV2) {
    static instance = null;
    deck = null;
    interactions = null;
    #listeners = new AbortController();
    #dragData = null;
    #isCollapsed = false;
    isVault = false;
    isEquipment = false;

    static DEFAULT_OPTIONS = {
        id: 'dh-card-deck',
        tag: 'div',
        classes: [
            'daggerheart',
            'dh-style',
            'dh-card-deck'
        ],
        position: {
            width: 'auto',
            height: 'auto'
        },
        window: {
            frame: false,
            positioned: false,
            resizable: false
        },
        actions: {
            toggleVault: this.#toggleVault,
            toggleEquipment: this.#toggleEquipment,
            toggleHUD: this.#toggleHUD,
            toggleMenu: this.#toggleMenu,
            toggleItemType: this.#toggleItemType,
            useCard: this.#useCard,
            sendToVault: this.#sendToVault,
            sendToLoadout: this.#sendToLoadout,
            recall: this.#recall,
            sendToChat: this.#sendToChat,
            editItem: this.#editItem,
            cancelBeastform: this.#cancelBeastform,
            copyUuid: this.#copyUuid,
            toggleEquipped: this.#toggleEquipped
        }
    };

    static PARTS = {
        deck: {
            template: 'modules/daggerheart-card-deck-hud/templates/deck.hbs'
        },
        controls: {
            template: 'modules/daggerheart-card-deck-hud/templates/controls.hbs'
        }
    };

    #actor = null;
    #token = null;

    constructor(options = {}) {
        super(options);
    }

    static async create() {
        if (this.instance) return this.instance;

        const hud = new this();
        this.instance = hud;

        await hud.render({force: true});
        hud.element.setAttribute('hidden', '');

        const token = canvas.tokens?.controlled[0];

        if (token?.actor) hud.setActor(token.actor, token);
    }

    static async destroy() {
        if (!this.instance) return;

        const instance = this.instance;
        this.instance = null;
        await instance.close({ animate: false });
    }

    async _onClose(options) {
        this.interactions?.dispose();
        this.#listeners.abort();
        document.removeEventListener('pointermove', this.#onDragMove);
        document.removeEventListener('pointerup', this.#onDragEnd);
        await super._onClose(options);

        if (DHCardDeckHUD.instance === this) DHCardDeckHUD.instance = null;
    }

    get actor() {
        return this.#actor;
    }

    get token() {
        return this.#token;
    }

    get isCharacter() {
        return this.actor.type === 'character';
    }

    get cardWidth() {
        return 10 * parseFloat(getComputedStyle(document.documentElement).fontSize) * (game.settings.get(MODULE_ID, 'cardWidth') / 5);
    }

    /** @override */
    async _insertElement(element, options) {
        const uiBottom = document.querySelector('#ui-bottom');
        const uiRight = document.querySelector('#ui-right-column-1');
        const positionSetting = game.settings.get(MODULE_ID, 'deckPosition');

        switch (positionSetting) {
            case 'center':
                if (uiBottom) {
                    uiBottom.prepend(element);
                    return;
                }
                break;    
            case 'right':
                if (uiRight) uiRight.appendChild(element);
                break;
            case 'custom':
                const position = game.settings.get(MODULE_ID, 'deckCustomPosition');
                element.style.left = `${position.left ?? 0}px`;
                element.style.top = `${position.top ?? 0}px`;
                break;
        }

        element.classList.add('alternate-positioning', `position-${positionSetting}`);

        return super._insertElement(element, options);
    }

    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);        

        this.element.style.setProperty('--card-width', `${this.cardWidth}px`);
        this.setLockPosition();
        this.interactions = new HandInteractions(this);

        ['click', 'contextmenu'].forEach(eventType => {
            document.addEventListener(eventType, event => {
                if (this.deck?.cards) this._selectCard();
                if (!this.parts.controls.hasAttribute('data-menu-open') || event.target.closest('.dh-cd-control-settings-menu')) return;
                this._toggleMenu(event);
            }, { signal: this.#listeners.signal });
        });
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        if (!this.#actor) return;

        if (options.parts?.includes('deck')) {
            this.interactions?.reset();
            this.parts.deck.replaceChildren(...[...this.deck.cards.values()].map(card => card.element));
            this.deck._setDeckSize();

            for (const card of this.deck.cards.values()) {
                card.element.addEventListener('contextmenu', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    
                    if (event.target.closest('button[data-action="copyUuid"]')) {
                        const label = _loc(card.item.constructor.metadata.label);
                        game.clipboard.copyPlainText(card.item.id);
                        return ui.notifications.info('DOCUMENT.IdCopiedClipboard', {format: {label, type: 'ID', id: card.item.id}});
                    }

                    this._selectCard(card);
                    if (this.parts.controls.hasAttribute('data-menu-open')) this._toggleMenu(event);
                });
                
                card.element.addEventListener('transitionend', event => {
                    if (event.target !== card.element || event.propertyName !== 'transform') return;
                    if (card.selected) card.element.classList.add('show-actions');
                });
            }
            this.deck.applyGradient(game.settings.get(MODULE_ID, 'cardGradient'));
            this.deck.setVarStyle();
        }

        this.interactions?.refresh();

        this.updateMarginPosition();

        if (options.parts?.includes('controls')) {
            const menu = this.parts.controls.querySelector('.dh-cd-control-settings-menu');

            let dragged = null;

            menu.addEventListener('dragstart', event => {
                dragged = event.target.closest('label');
            });

            menu.addEventListener('dragover', event => {
                event.preventDefault();

                const target = event.target.closest('label');

                if (!target || target === dragged) return;

                const rect = target.getBoundingClientRect();
                const after = event.clientY > rect.top + rect.height / 2;

                menu.insertBefore(
                    dragged,
                    after ? target.nextSibling : target
                );
            });

            menu.addEventListener('dragend', async () => {
                dragged = null;

                await this._saveItemTypes();
                await this.deck.createCards();
                await this.render({ parts: ['deck'] });
            });

            const settingsButton = this.element.querySelector('[data-action=\'toggleMenu\']');
            if (settingsButton) settingsButton.addEventListener('contextmenu', this._toggleMenu.bind(this));

            const moveButton = this.element.querySelector('.dh-cd-control-move');
            if (moveButton) {
                moveButton.addEventListener('pointerdown', this.#onDragStart);
                moveButton.addEventListener('contextmenu', event => {
                    const lockSetting = game.settings.get(MODULE_ID, 'lockPosition');
                    game.settings.set(MODULE_ID, 'lockPosition', !lockSetting);
                });
            }
        }

        // Test Animation Cards Reveal
        /* deckElement.replaceChildren();

        for (const card of this.deck.cards) {
            deckElement.append(card.element);

            await new Promise(resolve => setTimeout(resolve, 20));
        } */
    }

    updateMarginPosition({ deckBorderMargin, deckBottomMargin, deckBetweenMargin } = {}) {
        if (!this.element) return;
        deckBorderMargin ??= game.settings.get(MODULE_ID, 'deckBorderMargin');
        deckBottomMargin ??= game.settings.get(MODULE_ID, 'deckBottomMargin');
        deckBetweenMargin ??= game.settings.get(MODULE_ID, 'deckBetweenMargin');
        this.element.style.setProperty('--borderMargin', `${deckBorderMargin}px`);
        this.element.style.setProperty('--bottomMargin', `${deckBottomMargin}px`);
        this.element.style.setProperty('--betweenMargin', `${deckBetweenMargin}px`);
    }

    setLockPosition() {
        this.element.setAttribute('data-lock-position', game.settings.get(MODULE_ID, 'lockPosition'));
    }

    async setActor(actor, token = null) {
        this.#actor = actor;
        this.#token = token;
        this.isVault = false;
        this.isEquipment = false;

        this.element.removeAttribute('hidden');
        
        await this.createDeck();
    }

    async clearActor() {
        this.interactions?.reset();
        this.#isCollapsed = false;
        this.element.classList.remove('is-hidden');
        this.#actor = null;
        this.#token = null;
        this.deck = null;

        this.element.setAttribute('hidden', '');
        this.element.replaceChildren();
    }

    async createDeck() {
        this.interactions?.reset();
        this.deck = await DHDeck.create(this.#actor, this);
        await this.render({ parts: ['deck', 'controls'] });
    }

    /* -------------------------------------------- */

    /** @override */
    async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);
        if (!this.#actor) return context;
        switch (partId) {
            case 'deck': return this._prepareDeckContext(context, options);
            case 'controls': return this._prepareControlsContext(context, options);
        }
        return context;
    }

    _prepareDeckContext(context, options) {
        if (!this.#actor) return context;
        context.classes = this.deck.classes;
        context.cardCount = this.deck.cards.size;
        context.cardOverlap = game.settings.get(MODULE_ID, 'cardOverlap') ?? 55;
        return context;
    }

    _prepareControlsContext(context, options) {
        context.itemTypes = this.deck.itemTypes;
        context.isFreePositioning = game.settings.get(MODULE_ID, 'deckPosition') === 'custom';
        context.isCharacter = this.isCharacter;
        context.characterType = this.#actor.type;
        if (this.isCharacter) {
            context.isVault = this.isVault;
            context.isEquipment = this.isEquipment;
            context.hasVaultCards = this.#actor.system.domainCards.vault.length > 0;
            context.hasEquipmentCards = this.#actor.items.filter(item => item.system.equipped === false).length > 0;
        }
        return context;
    }

    static async #toggleVault() {
        this.isVault = !this.isVault;
        await this.deck.createCards();
        await this.render({ parts: ['deck', 'controls'] });
    }

    static async #toggleEquipment() {
        this.isEquipment = !this.isEquipment;
        await this.deck.createCards();
        await this.render({ parts: ['deck', 'controls'] });
    }

    static async #toggleHUD() {
        this.interactions?.reset();
        this.#isCollapsed = !this.#isCollapsed;

        const deck = this.parts.deck;
        const marginSetting = game.settings.get(MODULE_ID, 'deckBottomMargin');
        let offset = '0px';

        if (!deck) return;

        if (this.#isCollapsed) {
            const rect = deck.getBoundingClientRect();
            const transform = new DOMMatrixReadOnly(getComputedStyle(deck).transform);
            offset = `calc(${window.innerHeight - rect.top + transform.m42}px + 1rem + ${marginSetting}px)`;
        }

        deck.style.setProperty('--dh-cd-hide-offset', offset);

        this.element.classList.toggle('is-hidden', this.#isCollapsed);
        this.interactions?.schedule();
    }

    static async #toggleMenu(event) {
        this._toggleMenu(event);
    }

    async _toggleMenu(event) {
        event.preventDefault();
        event.stopPropagation();
        this.parts.controls.toggleAttribute('data-menu-open');
        this.interactions?.reveal();
        this.interactions?.schedule();
    }

    static async #toggleItemType(event, target) {
        const type = target.dataset.type;
        const itemType = this.deck.itemTypes.find(item => item.type === type);

        if (!itemType) return;

        itemType.active = !itemType.active;

        this._saveItemTypes();
        await this.deck.createCards();
        await this.render({ parts: ['deck'] });
    }

    async _saveItemTypes() {
        const itemTypes = [...this.parts.controls.querySelectorAll('.dh-cd-control-settings-menu label')]
            .map(label => ({
                type: label.dataset.type,
                active: label.querySelector('input[type="checkbox"]').checked
            }));

        this.deck.itemTypes = itemTypes;

        await game.settings.set(MODULE_ID, this.deck.itemTypesSetting, itemTypes);
    }

    static #useCard(event, target) {
        event.stopPropagation();
        const { cardId } = target.closest('[data-card-id]').dataset;
        const card = this.deck.cards.get(cardId);

        if (!card.isLocked && this.isEquipment && card.item.system.equipped === false) return card.toggleEquipped();
        if (!card.isLocked && (!game.settings.get(MODULE_ID, 'directAction') || card.selected)) return card.use(event);
        this._selectCard(card);
    }

    static #toggleEquipped(event, target) {
        const { cardId } = target.closest('[data-card-id').dataset;
        const card = this.deck.cards.get(cardId);
        if (!card.isLocked) return card.toggleEquipped();
    }

    _selectCard(card) {
        if (!this.deck) return;
        let changed = Boolean(card);
        if (card) card.toggleSelected();
        for (const otherCard of this.deck.cards.values()) {
            if (otherCard !== card && otherCard.selected) {
                otherCard.selected = false;
                changed = true;
            }
        }
        if (changed) {
            this.interactions?.reveal();
            this.interactions?.schedule();
        }
    }

    static _unselectCard(event, force = false) {
        const selectedCard = DHCardDeckHUD.instance.element.querySelector('.dh-card.selected');
        if ((selectedCard && !selectedCard.contains(event.target)) || force) {
            DHCardDeckHUD.instance.element.querySelectorAll('.dh-card.selected')
                .forEach(c => {
                    c.classList.remove('show-actions');
                    c.classList.remove('selected');
                });
        }
    }

    static async #sendToVault(event, target) {
        const { itemId } = target.closest('[data-item-id').dataset;
        const item = fromUuidSync(itemId);
        if (!item && !(typeof item.system?.toggleVault === 'function')) return;
        await item.system.toggleVault(event, true, false);
    }

    static async #sendToLoadout(event, target) {
        const { itemId } = target.closest('[data-item-id').dataset;
        const item = fromUuidSync(itemId);
        if (!item && !(typeof item.system?.toggleVault === 'function')) return;
        await item.system.toggleVault(event, false, false);
    }

    static async #recall(event, target) {
        const { itemId } = target.closest('[data-item-id').dataset;
        const item = fromUuidSync(itemId);
        if (!item && !(typeof item.system?.toggleVault === 'function')) return;
        await item.system.toggleVault(event, false, true);
    }

    static #sendToChat(event, target) {
        event.preventDefault();
        event.stopPropagation();
        const { itemId } = target.closest('[data-item-id').dataset;
        const item = fromUuidSync(itemId);
        if (!item) return;
        item.toChat(item.uuid);
    }

    static #editItem(event, target) {
        const card = target.closest('[data-item-id');
        const { itemId } = card.dataset;
        const item = fromUuidSync(itemId);
        if (!item) return;
        item.sheet.render({ force: true });
        card.classList.remove('show-actions');
        card.classList.remove('selected');
    }

    static #cancelBeastform(event, target) {
        const card = target.closest('[data-item-id');
        const { itemId } = card.dataset;
        const item = fromUuidSync(itemId);
        if (!item) return;
        item.delete();
    }

    static #copyUuid(event, target) {
        event.preventDefault();
        event.stopPropagation();
        const { itemId } = target.closest('[data-item-id').dataset;
        const item = fromUuidSync(itemId);
        if (!item) return;
        const label = _loc(item.constructor.metadata.label);
        game.clipboard.copyPlainText(item.uuid);
        ui.notifications.info('DOCUMENT.IdCopiedClipboard', {format: {label, type: 'UUID', id: item.uuid}});
    }

    #onDragStart = event => {
        if (game.settings.get(MODULE_ID, 'lockPosition')) return;
        
        event.preventDefault();

        this.element.setAttribute('data-dragging', '');
        const rect = this.element.getBoundingClientRect();

        this.#dragData = {
            startX: event.clientX,
            startY: event.clientY,
            left: rect.left,
            top: rect.top
        };

        document.addEventListener('pointermove', this.#onDragMove);
        document.addEventListener('pointerup', this.#onDragEnd, { once: true });
    }

    #onDragMove = event => {
        if (!this.#dragData) return;

        const {
            startX,
            startY,
            left,
            top
        } = this.#dragData;

        const dx = event.clientX - startX;
        const dy = event.clientY - startY;

        const width = this.element.offsetWidth;
        const height = this.element.offsetHeight;

        const newLeft = Math.min(
            Math.max(0, left + dx),
            window.innerWidth - width
        );

        const newTop = Math.min(
            Math.max(0, top + dy),
            window.innerHeight - height
        );

        this.element.style.left = `${newLeft}px`;
        this.element.style.top = `${newTop}px`;
    }

    #onDragEnd = async event => {
        this.element.removeAttribute('data-dragging');
        document.removeEventListener('pointermove', this.#onDragMove);

        if (!this.#dragData) return;

        const rect = this.element.getBoundingClientRect();

        await game.settings.set(MODULE_ID, 'deckCustomPosition', {
            left: rect.left,
            top: rect.top
        });

        this.#dragData = null;
    }
}
