import { MODULE_ID } from '../system/constants';

/** Owns transient hand interactions, so timers and pointer listeners share the HUD's lifecycle. */
export default class HandInteractions {
    #hud;
    #listeners = new AbortController();
    #hideTimer = null;
    #clickTimer = null;
    #drag = null;
    #suppressClick = false;
    #disposed = false;
    #returnFades = new Map();
    #expansion = null;

    constructor(hud) {
        this.#hud = hud;
        const options = { signal: this.#listeners.signal };
        hud.element.addEventListener('pointerover', event => {
            if (this.#isCardTarget(event.target)) this.reveal();
        }, options);
        hud.element.addEventListener('pointerout', event => {
            if (this.#isCardTarget(event.target) && !this.#isCardTarget(event.relatedTarget)) this.schedule();
        }, options);
        hud.element.addEventListener('focusin', event => {
            if (this.#isCardTarget(event.target)) this.reveal();
        }, options);
        hud.element.addEventListener('focusout', event => {
            if (this.#isCardTarget(event.target)) this.schedule();
        }, options);
        hud.element.addEventListener('pointerdown', event => this.#onPointerDown(event), options);
        hud.element.addEventListener('dragstart', event => {
            if (event.target.closest('.dh-card-wrapper')) event.preventDefault();
        }, options);
        document.addEventListener('pointermove', event => this.#onPointerMove(event), options);
        document.addEventListener('pointerup', event => this.#onPointerUp(event), options);
        document.addEventListener('pointercancel', () => this.#finishDrag(false), options);
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && this.#drag) {
                event.preventDefault();
                this.#finishDrag(false);
            }
        }, options);
        document.addEventListener('click', event => {
            if (!this.#suppressClick) return;
            event.preventDefault();
            event.stopImmediatePropagation();
        }, { ...options, capture: true });
        window.addEventListener('blur', () => this.#finishDrag(false), options);
        this.refresh();
    }

    refresh() {
        const element = this.#hud.element;
        element.dataset.cardTheme = game.settings.get(MODULE_ID, 'cardTheme');
        element.style.setProperty('--auto-hide-distance', `${game.settings.get(MODULE_ID, 'autoHideDistance')}px`);
        this.#refreshReturnFades();
        this.reveal();
        this.schedule();
    }

    reveal() {
        clearTimeout(this.#hideTimer);
        this.#hideTimer = null;
        const { element, parts } = this.#hud;
        if (this.#hud.isSwitchingActors) {
            this.#clearExpansion();
            element.classList.remove('is-auto-collapsed');
            return;
        }
        if (!element.classList.contains('is-auto-collapsed')) return;
        element.classList.add('is-expanding');
        element.classList.remove('is-auto-collapsed');
        const hand = parts.deck;
        const transitions = hand?.getAnimations().filter(animation => animation.transitionProperty === 'transform') ?? [];
        if (!transitions.length) {
            this.#clearExpansion();
            return;
        }
        const expansion = this.#expansion = { hand };
        Promise.allSettled(transitions.map(animation => animation.finished)).then(() => {
            if (this.#expansion !== expansion) return;
            this.#clearExpansion();
            this.schedule();
        });
    }

    #clearExpansion() {
        this.#expansion = null;
        this.#hud.element.classList.remove('is-expanding');
    }

    #isCardTarget(target) {
        const surface = target?.closest?.('.dh-card, .hover-layout');
        return Boolean(surface && this.#hud.parts.deck?.contains(surface));
    }

    #isBusy() {
        const { element, deck, parts } = this.#hud;
        return !deck?.size || element.hidden || element.hasAttribute('data-dragging') || this.#hud.isSwitchingActors
            || Boolean(parts.deck?.querySelector('.dh-card:hover, .hover-layout:hover, :focus-visible'))
            || this.#expansion || this.#drag || this.#returnFades.size
            || [...deck.cards.values()].some(card => card.selected);
    }

    schedule() {
        clearTimeout(this.#hideTimer);
        this.#hideTimer = null;
        if (this.#disposed || !game.settings.get(MODULE_ID, 'autoHide') || this.#isBusy()) return;
        this.#hideTimer = setTimeout(() => {
            this.#hideTimer = null;
            if (!this.#isBusy()) this.#hud.element.classList.add('is-auto-collapsed');
        }, game.settings.get(MODULE_ID, 'autoHideDelay') * 1000);
    }

    reset() {
        if (this.#expansion?.hand !== this.#hud.parts.deck) this.#clearExpansion();
        this.reveal();
        this.#removeDrag();
    }

    dispose() {
        this.#disposed = true;
        this.reset();
        this.#clearExpansion();
        for (const fade of this.#returnFades.values()) fade.animation?.cancel();
        this.#returnFades.clear();
        clearTimeout(this.#clickTimer);
        this.#listeners.abort();
    }

    #onPointerDown(event) {
        if (event.button !== 0 || !event.isPrimary || this.#drag
            || this.#hud.isSwitchingActors
            || !game.settings.get(MODULE_ID, 'dragToPlay') || this.#hud.isVault || this.#hud.isEquipment) return;
        if (event.altKey && game.settings.get(MODULE_ID, 'deckPosition') === 'custom') return;
        const wrapper = event.target.closest('.dh-card-wrapper');
        if (!wrapper || event.target.closest('button, a, input, select, textarea, [contenteditable], .dh-card-description')) {
            return;
        }
        const card = this.#hud.deck?.cards.get(wrapper.dataset.cardId);
        if (!card || card.isLocked) return;
        this.reveal();
        this.#drag = {
            card,
            actor: this.#hud.actor,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            x: event.clientX,
            y: event.clientY,
            active: false,
            settling: false
        };
    }

    #onPointerMove(event) {
        const drag = this.#drag;
        if (!drag || drag.settling || event.pointerId !== drag.pointerId) return;
        drag.x = event.clientX;
        drag.y = event.clientY;
        if (!drag.active && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 8) return;
        event.preventDefault();
        if (!drag.active) this.#startDrag(drag);
        drag.ghost.style.left = `${drag.left + drag.x - drag.startX}px`;
        drag.ghost.style.top = `${drag.top + drag.y - drag.startY}px`;
        drag.layer.classList.toggle('can-play', this.#isPlayTarget(drag.x, drag.y));
    }

    #startDrag(drag) {
        drag.active = true;
        const source = drag.card.element;
        const rect = source.getBoundingClientRect();
        const matrix = new DOMMatrixReadOnly(getComputedStyle(source).transform);
        drag.angle = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
        drag.scale = Math.hypot(matrix.a, matrix.b);
        drag.left = rect.left + rect.width / 2 - source.offsetWidth / 2;
        drag.top = rect.top + rect.height / 2 - source.offsetHeight / 2;

        const layer = document.createElement('div');
        layer.className = 'daggerheart dh-style dh-card-play-layer';
        layer.dataset.cardTheme = this.#hud.element.dataset.cardTheme;
        layer.style.colorScheme = getComputedStyle(this.#hud.element).colorScheme;
        layer.style.setProperty('--card-width', `${this.#hud.cardWidth}px`);
        layer.setAttribute('aria-hidden', 'true');
        const deck = document.createElement('div');
        deck.className = 'dh-cd-cards no-gradient';
        const ghost = source.cloneNode(true);
        ghost.style.width = `${source.offsetWidth}px`;
        ghost.classList.remove('selected');
        ghost.classList.add('is-play-ghost');
        ghost.removeAttribute('data-action');
        ghost.querySelectorAll('.hover-layout').forEach(element => element.remove());
        ghost.style.left = `${drag.left}px`;
        ghost.style.top = `${drag.top}px`;
        ghost.style.transform = `rotate(${drag.angle}deg) scale(${drag.scale})`;
        deck.append(ghost);
        const hint = document.createElement('div');
        hint.className = 'dh-card-play-hint';
        hint.textContent = _loc('DHDECKCARD.GENERAL.DragToPlay');
        layer.append(deck, hint);
        document.body.append(layer);
        ghost.getBoundingClientRect();
        ghost.style.transform = 'rotate(0deg) scale(1.08)';
        source.classList.add('is-drag-source');
        this.#hud.element.classList.add('is-playing-card');
        Object.assign(drag, { layer, ghost });
    }

    #isPlayTarget(x, y) {
        // The hidden source and gaps between cards pass pointer events through to the canvas.
        // Reserve the whole hand, including cards extending outside its layout bounds, for returning cards.
        const handElements = [this.#hud.element, ...[...this.#hud.deck.cards.values()].map(card => card.element)];
        if (handElements.some(element => {
            const rect = element.getBoundingClientRect();
            return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        })) return false;
        // Only the canvas accepts a play: dropping over a dialog, sidebar or another card cancels it.
        return Boolean(document.elementFromPoint(x, y)?.closest('#board'));
    }

    #onPointerUp(event) {
        const drag = this.#drag;
        if (!drag || event.pointerId !== drag.pointerId || drag.settling) return;
        if (!drag.active) {
            this.#drag = null;
            this.schedule();
            return;
        }
        this.suppressNextClick();
        this.#finishDrag(this.#isPlayTarget(event.clientX, event.clientY), event);
    }

    suppressNextClick() {
        this.#suppressClick = true;
        clearTimeout(this.#clickTimer);
        this.#clickTimer = setTimeout(() => { this.#suppressClick = false; }, 0);
    }

    async #finishDrag(play, event) {
        const drag = this.#drag;
        if (!drag || drag.settling) return;
        if (!drag.active) {
            this.#drag = null;
            this.schedule();
            return;
        }
        drag.settling = true;
        drag.layer.classList.add('is-settling');
        const rect = drag.card.element.getBoundingClientRect();
        const returnMatrix = new DOMMatrixReadOnly(getComputedStyle(drag.card.element).transform);
        const returnAngle = Math.atan2(returnMatrix.b, returnMatrix.a) * 180 / Math.PI;
        const returnScale = Math.hypot(returnMatrix.a, returnMatrix.b);
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const target = play ? {
            transform: 'translateY(-28px) rotate(-4deg) scale(1.2)',
            opacity: 0
        } : {
            left: `${rect.left + rect.width / 2 - drag.card.element.offsetWidth / 2}px`,
            top: `${rect.top + rect.height / 2 - drag.card.element.offsetHeight / 2}px`,
            transform: `rotate(${returnAngle}deg) scale(${returnScale})`
        };
        drag.animation = drag.ghost.animate([{}, target], {
            duration: reducedMotion ? 0 : play ? 260 : 180,
            easing: 'ease-out',
            fill: 'forwards'
        });
        try {
            await drag.animation.finished;
            if (this.#drag !== drag) return;
            const canUse = play && this.#hud.actor === drag.actor
                && this.#hud.deck?.cards.get(drag.card.id) === drag.card;
            this.#removeDrag({ fadeIn: canUse });
            if (canUse) {
                await drag.card.use(event);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(`${MODULE_ID} | Failed to play card`, error);
                ui.notifications.error('DHDECKCARD.ERRORS.PlayCard', { localize: true });
            }
        } finally {
            if (this.#drag === drag) this.#removeDrag();
            this.schedule();
        }
    }

    #cardKey(card) {
        return `${card.item.uuid ?? card.item.id ?? `${card.item.type}:${card.index}`}:${card.item.featureState ?? ''}`;
    }

    #fadeCardIn(card) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const key = this.#cardKey(card);
        this.#returnFades.get(key)?.animation?.cancel();
        this.#returnFades.set(key, { actor: this.#hud.actor, startedAt: performance.now() });
        this.#refreshReturnFades();
    }

    #refreshReturnFades() {
        for (const [key, fade] of this.#returnFades) {
            const elapsed = performance.now() - fade.startedAt;
            const card = [...(this.#hud.deck?.cards.values() ?? [])].find(card => this.#cardKey(card) === key);
            if (fade.actor !== this.#hud.actor || !card || elapsed >= 300) {
                fade.animation?.cancel();
                this.#returnFades.delete(key);
                continue;
            }
            if (fade.element === card.element) continue;
            // Resource updates can rebuild the hand during the fade; continue on the replacement element.
            const opacity = fade.animation ? elapsed / 300 : 0;
            fade.animation?.cancel();
            const animation = card.element.animate([{ opacity }, { opacity: 1 }], {
                duration: 300 - elapsed,
                easing: 'linear'
            });
            Object.assign(fade, { element: card.element, animation });
            animation.finished.then(() => {
                if (this.#returnFades.get(key) !== fade || fade.animation !== animation) return;
                this.#returnFades.delete(key);
                this.schedule();
            }, () => {});
        }
    }

    #removeDrag({ fadeIn = false } = {}) {
        const drag = this.#drag;
        this.#drag = null;
        drag?.animation?.cancel();
        drag?.card.element.classList.remove('is-drag-source');
        if (fadeIn && drag) this.#fadeCardIn(drag.card);
        drag?.layer?.remove();
        this.#hud.element.classList.remove('is-playing-card');
    }
}
