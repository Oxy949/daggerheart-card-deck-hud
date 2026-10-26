import { MODULE_ID } from '../system/constants';
import DHDeck from './deck';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class HandSorting extends HandlebarsApplicationMixin(ApplicationV2) {
    #defaults = false;

    static DEFAULT_OPTIONS = {
        id: 'dh-hand-sorting',
        tag: 'form',
        classes: ['daggerheart', 'dh-style', 'dh-hand-sorting'],
        window: { title: 'DHDECKCARD.SETTINGS.HandSorting.name' },
        position: { width: 540, height: 'auto' },
        form: { handler: this.#onSubmit, closeOnSubmit: true },
        actions: {
            moveTypeUp: this.#moveUp,
            moveTypeDown: this.#moveDown,
            resetOrder: this.#resetOrder
        }
    };

    static PARTS = {
        form: { template: 'modules/daggerheart-card-deck-hud/templates/hand-sorting.hbs' }
    };

    async _prepareContext(options) {
        const getTypes = actorType => this.#defaults
            ? DHDeck.getDefaultItemTypes(actorType) : DHDeck.getItemTypes(actorType);
        return {
            ...(await super._prepareContext(options)),
            groups: [
                { setting: 'itemTypes', label: 'DHDECKCARD.SETTINGS.HandSorting.characters', items: getTypes('character') },
                { setting: 'itemTypesNPC', label: 'DHDECKCARD.SETTINGS.HandSorting.npcs', items: getTypes('adversary') }
            ]
        };
    }

    _attachPartListeners(partId, element, options) {
        super._attachPartListeners(partId, element, options);
        let dragged = null;
        element.addEventListener('dragstart', event => {
            dragged = event.target.closest('[data-item-type]');
            if (!dragged) return;
            event.dataTransfer.setData('text/plain', dragged.dataset.itemType);
            event.dataTransfer.effectAllowed = 'move';
        });
        element.addEventListener('dragover', event => {
            const target = event.target.closest('[data-item-type]');
            if (!dragged || !target || target === dragged || target.parentElement !== dragged.parentElement) return;
            event.preventDefault();
            const rect = target.getBoundingClientRect();
            const after = event.clientY > rect.top + rect.height / 2;
            target.parentElement.insertBefore(dragged, after ? target.nextSibling : target);
        });
        element.addEventListener('drop', event => { event.preventDefault(); dragged = null; });
        element.addEventListener('dragend', () => { dragged = null; });
    }

    static #moveUp(event, target) {
        const row = target.closest('[data-item-type]');
        row.previousElementSibling?.before(row);
        target.focus();
    }

    static #moveDown(event, target) {
        const row = target.closest('[data-item-type]');
        row.nextElementSibling?.after(row);
        target.focus();
    }

    static async #resetOrder() {
        this.#defaults = true;
        await this.render({ parts: ['form'] });
    }

    static async #onSubmit(event, form) {
        for (const group of form.querySelectorAll('[data-type-setting]')) {
            const items = [...group.querySelectorAll('[data-item-type]')].map(row => ({
                type: row.dataset.itemType,
                active: row.querySelector('input[type="checkbox"]').checked
            }));
            await game.settings.set(MODULE_ID, group.dataset.typeSetting, items);
        }
    }
}
