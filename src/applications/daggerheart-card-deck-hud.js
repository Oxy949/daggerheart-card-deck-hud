import { MODULE_ID } from '../system/constants';
import DHDeck from './deck';
import HandInteractions from './hand-interactions';
import { getHUDActor } from '../system/actor-selection';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class DHCardDeckHUD extends HandlebarsApplicationMixin(ApplicationV2) {
    static instance = null;
    deck = null;
    interactions = null;
    #listeners = new AbortController();
    #dragData = null;
    #actor = null;
    #token = null;
    #target = null;
    #switchPromise = null;
    #actorAnimation = null;
    #selectionVersion = 0;
    #deckVersion = 0;
    #needsRefresh = false;
    #closed = false;
    #selectionChanged = null;

    static DEFAULT_OPTIONS = {
        id: 'dh-card-deck',
        tag: 'div',
        classes: ['daggerheart', 'dh-style', 'dh-card-deck'],
        position: { width: 'auto', height: 'auto' },
        window: { frame: false, positioned: false, resizable: false },
        actions: { useCard: this.#useCard }
    };

    static PARTS = {
        deck: { template: 'modules/daggerheart-card-deck-hud/templates/deck.hbs' }
    };

    static async create() {
        if (this.instance) return this.instance;
        const hud = new this();
        this.instance = hud;
        await hud.render({ force: true });
        hud.element.hidden = true;
        const { actor, token } = getHUDActor();
        await hud.setActor(actor, token);
        return hud;
    }

    static async destroy() {
        if (!this.instance) return;
        const instance = this.instance;
        this.instance = null;
        await instance.close({ animate: false });
    }

    async _onClose(options) {
        this.#closed = true;
        this.#selectionVersion++;
        this.#deckVersion++;
        this.#actorAnimation?.cancel();
        this.#selectionChanged?.();
        this.interactions?.dispose();
        this.#listeners.abort();
        document.removeEventListener('pointermove', this.#onDragMove);
        document.removeEventListener('pointerup', this.#onDragEnd);
        await super._onClose(options);
        if (DHCardDeckHUD.instance === this) DHCardDeckHUD.instance = null;
    }

    get actor() { return this.#actor; }
    get token() { return this.#token; }
    get requestedActor() { return this.#target ? this.#target.actor : this.#actor; }
    get isSwitchingActors() { return this.element?.classList.contains('is-switching-actors') ?? false; }
    get isCharacter() { return this.actor?.type === 'character'; }
    get isVault() { return this.isCharacter && game.settings.get(MODULE_ID, 'handView') === 'vault'; }
    get isEquipment() { return this.isCharacter && game.settings.get(MODULE_ID, 'handView') === 'equipment'; }

    get cardWidth() {
        const fontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
        return 10 * fontSize * (game.settings.get(MODULE_ID, 'cardWidth') / 5);
    }

    async _insertElement(element, options) {
        const uiBottom = document.querySelector('#ui-bottom');
        const uiRight = document.querySelector('#ui-right-column-1');
        const positionSetting = game.settings.get(MODULE_ID, 'deckPosition');
        switch (positionSetting) {
            case 'center':
                if (uiBottom) { uiBottom.prepend(element); return; }
                break;
            case 'right':
                if (uiRight) uiRight.appendChild(element);
                break;
            case 'custom': {
                const position = game.settings.get(MODULE_ID, 'deckCustomPosition');
                element.style.left = `${position.left ?? 0}px`;
                element.style.top = `${position.top ?? 0}px`;
                break;
            }
        }
        element.classList.add('alternate-positioning', `position-${positionSetting}`);
        return super._insertElement(element, options);
    }

    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);
        this.element.style.setProperty('--card-width', `${this.cardWidth}px`);
        this.setLockPosition();
        this.interactions = new HandInteractions(this);
        const listeners = { signal: this.#listeners.signal };
        this.element.addEventListener('pointerdown', this.#onDragStart, listeners);
        this.element.addEventListener('contextmenu', async event => {
            const wrapper = event.target.closest('.dh-card-wrapper');
            const card = this.deck?.cards.get(wrapper?.dataset.cardId);
            if (!card) return;
            event.preventDefault();
            event.stopPropagation();
            if (this.isSwitchingActors) return;
            await card.openDocument();
        }, listeners);
        document.addEventListener('click', () => this._selectCard(), listeners);
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        if (!this.#actor) return;
        if (options.parts?.includes('deck')) {
            this.interactions?.reset();
            this.parts.deck.replaceChildren(...[...this.deck.cards.values()].map(card => card.element));
            this.deck._setDeckSize();
            this.deck.applyGradient(game.settings.get(MODULE_ID, 'cardGradient'));
            this.deck.setVarStyle();
        }
        this.interactions?.refresh();
        this.updateMarginPosition();
    }

    updateMarginPosition({ deckBorderMargin, deckBottomMargin } = {}) {
        if (!this.element) return;
        deckBorderMargin ??= game.settings.get(MODULE_ID, 'deckBorderMargin');
        deckBottomMargin ??= game.settings.get(MODULE_ID, 'deckBottomMargin');
        this.element.style.setProperty('--borderMargin', `${deckBorderMargin}px`);
        this.element.style.setProperty('--bottomMargin', `${deckBottomMargin}px`);
    }

    setLockPosition() {
        this.element?.setAttribute('data-lock-position', game.settings.get(MODULE_ID, 'lockPosition'));
    }

    async setActor(actor, token = null) {
        if (this.#closed) return;
        actor ??= null;
        const sameActor = (a, b) => (a?.uuid ?? a?.id) === (b?.uuid ?? b?.id);
        if (!this.#switchPromise && sameActor(actor, this.#actor)) {
            this.#target = { actor, token };
            this.#token = token;
            if (actor && actor !== this.#actor) {
                this.#actor = actor;
                await this.createDeck();
            }
            return;
        }
        if (this.#switchPromise && actor === this.#target.actor) {
            this.#target.token = token;
            return this.#switchPromise;
        }
        this.#target = { actor, token };
        this.#selectionVersion++;
        this.#deckVersion++;
        this.#selectionChanged?.();
        if (!this.#switchPromise) {
            this.#switchPromise = this.#switchActor().finally(async () => {
                this.#actorAnimation?.cancel();
                this.#actorAnimation = null;
                this.#selectionChanged = null;
                this.element.classList.remove('is-switching-actors');
                this.#switchPromise = null;
                if (this.#closed) return;
                this.interactions?.refresh();
                if (this.#needsRefresh && this.#actor) {
                    this.#needsRefresh = false;
                    await this.createDeck();
                }
            });
        }
        return this.#switchPromise;
    }

    async clearActor() {
        return this.setActor(null);
    }

    async #switchActor() {
        const hand = this.parts.deck;
        const rect = hand?.getBoundingClientRect();
        const from = hand ? getComputedStyle(hand).transform : 'none';
        const visible = !this.element.hidden && this.deck?.size && rect?.bottom > 0 && rect.top < window.innerHeight;
        this.element.classList.add('is-switching-actors');
        this.interactions?.reset();
        if (visible) await this.#slideHand('out', from);
        while (!this.#closed) {
            const target = this.#target;
            const version = this.#selectionVersion;
            if (!target.actor) {
                this.#actor = null;
                this.#token = null;
                this.deck = null;
                this.element.hidden = true;
                this.element.replaceChildren();
                return;
            }
            let invalidate;
            const changed = new Promise(resolve => { invalidate = () => resolve(null); });
            this.#selectionChanged = invalidate;
            const deck = await Promise.race([DHDeck.create(target.actor, this), changed]);
            if (this.#selectionChanged === invalidate) this.#selectionChanged = null;
            if (this.#closed) return;
            if (!deck || version !== this.#selectionVersion) continue;
            this.#actor = target.actor;
            this.#token = target.token;
            this.deck = deck;
            this.#needsRefresh = false;
            this.element.hidden = false;
            await this.render({ parts: ['deck'] });
            if (this.#closed) return;
            if (version !== this.#selectionVersion) continue;
            await this.#slideHand('in');
            if (this.#closed) return;
            if (target.actor === this.#target.actor) {
                this.#token = this.#target.token;
                return;
            }
            await this.#slideHand('out');
        }
    }

    async #slideHand(direction, from) {
        this.#actorAnimation?.cancel();
        this.#actorAnimation = null;
        const hand = this.parts.deck;
        if (!hand || !this.deck?.size || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const rect = hand.getBoundingClientRect();
        const current = new DOMMatrixReadOnly(from ?? getComputedStyle(hand).transform).m42;
        const offset = Math.max(window.innerHeight - rect.top + 24, rect.height + 24, current);
        const hidden = { transform: `translateY(${offset}px)`, opacity: 0 };
        const visible = { transform: 'translateY(0px)', opacity: 1 };
        const frames = direction === 'out' ? [{ transform: from ?? visible.transform, opacity: 1 }, hidden]
            : [hidden, visible];
        const animation = this.#actorAnimation = hand.animate(frames, {
            duration: direction === 'out' ? 240 : 280,
            easing: direction === 'out' ? 'ease-in' : 'ease-out',
            fill: 'forwards'
        });
        animation.id = `dh-hand-${direction}`;
        try { await animation.finished; }
        catch (error) { if (error.name !== 'AbortError') throw error; }
    }

    async createDeck() {
        if (this.#closed) return;
        if (this.#switchPromise) {
            this.#selectionVersion++;
            this.#needsRefresh = true;
            this.#selectionChanged?.();
            return this.#switchPromise;
        }
        if (!this.#actor) return;
        const actor = this.#actor;
        const version = ++this.#deckVersion;
        this.interactions?.reset();
        const deck = await DHDeck.create(actor, this);
        if (this.#closed || version !== this.#deckVersion || actor !== this.#actor || this.#switchPromise) return;
        this.deck = deck;
        await this.render({ parts: ['deck'] });
    }

    async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);
        if (partId === 'deck' && this.#actor) context.classes = this.deck.classes;
        return context;
    }

    static #useCard(event, target) {
        event.stopPropagation();
        if (this.isSwitchingActors) return;
        const card = this.deck?.cards.get(target.closest('[data-card-id]')?.dataset.cardId);
        if (!card) return;
        if (!card.isLocked && this.isEquipment && card.item.system.equipped === false) return card.toggleEquipped();
        if (!card.isLocked && (!game.settings.get(MODULE_ID, 'directAction') || card.selected)) return card.use(event);
        this._selectCard(card);
    }

    _selectCard(card) {
        if (!this.deck || this.isSwitchingActors) return;
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

    #onDragStart = event => {
        if (!event.altKey || event.button !== 0 || !event.target.closest('.dh-card-wrapper')
            || this.isSwitchingActors
            || game.settings.get(MODULE_ID, 'deckPosition') !== 'custom'
            || game.settings.get(MODULE_ID, 'lockPosition')) return;
        event.preventDefault();
        event.stopPropagation();
        this.interactions?.reset();
        this.element.setAttribute('data-dragging', '');
        const rect = this.element.getBoundingClientRect();
        this.#dragData = { startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top };
        document.addEventListener('pointermove', this.#onDragMove);
        document.addEventListener('pointerup', this.#onDragEnd, { once: true });
    };

    #onDragMove = event => {
        if (!this.#dragData) return;
        const { startX, startY, left, top } = this.#dragData;
        const maxLeft = Math.max(0, window.innerWidth - this.element.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - this.element.offsetHeight);
        this.element.style.left = `${Math.min(Math.max(0, left + event.clientX - startX), maxLeft)}px`;
        this.element.style.top = `${Math.min(Math.max(0, top + event.clientY - startY), maxTop)}px`;
    };

    #onDragEnd = async () => {
        this.element.removeAttribute('data-dragging');
        document.removeEventListener('pointermove', this.#onDragMove);
        if (!this.#dragData) return;
        this.#dragData = null;
        this.interactions?.suppressNextClick();
        const rect = this.element.getBoundingClientRect();
        await game.settings.set(MODULE_ID, 'deckCustomPosition', { left: rect.left, top: rect.top });
        this.interactions?.schedule();
    };
}
