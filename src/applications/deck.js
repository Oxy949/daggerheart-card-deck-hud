import { MODULE_ID } from '../system/constants';
import DHCard from './card';
import AdversariesSelectionDialog from './dialogs/adversaries-selection-dialog';

export default class DHDeck {
    constructor(actor, parent) {
        this.actor = actor;
        this.parent = parent;
        this.cards = new Map();
        this.itemTypes = this._getItemTypes();
    }

    get size() {
        return this.cards.size;
    }

    get classes() {
        const classes = [];
        if (game.settings.get(MODULE_ID, 'deckStyle') === 'flat') classes.push('flat');
        if (this.actor.system.activeBeastform) classes.push('beastform');
        if (game.settings.get(MODULE_ID, 'hideDescription')) classes.push('description-hidden');
        if (game.settings.get(MODULE_ID, 'invertGradient')) classes.push('invert-gradient');
        return classes;
    }

    get element() {
        return this.parent.parts.deck;
    }

    get activeTypes() {
        return this.itemTypes.reduce((types, type) => {
            if (type.active) types.push(type.type);
            return types;
        }, []);
    }

    get itemTypesSetting() {
        return this.actor.type === 'character' ? 'itemTypes' : 'itemTypesNPC';
    }

    static async create(actor, parent) {
        const deck = new this(actor, parent);
        await deck.createCards();

        return deck;
    }

    async createCards() {
        const items = this.getItems();
        const entries = await Promise.all(
            items.map(async (item, index) => {
                const card = await DHCard.create(item, index);
                card.element.style = this.getCardStyle(items.length, card, game.settings.get(MODULE_ID, 'frontPosition'));
                return [ card.id, card ];
            })
        );
        this.cards = new Map(entries);
    }

    getItems() {
        const items = [];
        
        if (this.actor.type === 'character') {
            const view = game.settings.get(MODULE_ID, 'handView');
            if (view === 'equipment') return this.actor.items.filter(item => item.system.equipped === false);
            if (view === 'vault') return this.actor.system.domainCards.vault;

            const isBeastform = this.actor.system.activeBeastform;

            const primaryClass = this.actor.system.class.value;
            const primarySubclass = this.getSubclassCards(this.actor.system.class.subclass);
            const secondaryClass = this.actor.system.multiclass.value;
            const secondarySubclass = this.getSubclassCards(this.actor.system.multiclass.subclass);
            const domainCards = this.actor.system.domainCards.loadout;
            const ancestry = this.actor.system.ancestry;
            const community = this.actor.system.community;
            const armor = this.actor.system.armor;
            const beastform = isBeastform ? this.getBeastformCard() : [];
            const primaryWeapon = isBeastform || !this.actor.system.primaryWeapon ? this.simulateUnarmedCard()
                : this.actor.system.primaryWeapon;
            const secondaryWeapon = isBeastform ? null : this.actor.system.secondaryWeapon;
            const consumable = this.actor.items.filter(item => item.type === 'consumable');
            const loot = this.actor.items.filter(item => item.type === 'loot');

            items.push(...[
                ...loot,
                ...consumable,
                ancestry,
                community,
                primaryClass,
                ...primarySubclass,
                secondaryClass,
                ...secondarySubclass,
                ...domainCards,
                armor,
                ...beastform,
                primaryWeapon,
                secondaryWeapon
            ]);
        } else {
            items.push(...this.actor.items);
            if (this.actor.system.attack) items.push(this.simulateUnarmedCard());
            if (this.actor.type === 'companion') items.push(this.simulateActionRollCard());
            if (this.actor.type === 'environment' && Object.values(this.actor.system.potentialAdversaries).some(({ adversaries }) => adversaries.length > 0)) items.push(this.simulatePotentialAdversariesCard());
        }

        const order = new Map(this.itemTypes.map((itemType, index) => [itemType.type, index]));

        return items
            .filter(item => Boolean(item) && this.activeTypes.includes(item.type))
            .sort((a, b) => {
                const aIndex = order.get(a.type) ?? Infinity;
                const bIndex = order.get(b.type) ?? Infinity;

                return aIndex - bIndex;
            });
    }

    getSubclassCards(item) {
        if (!item) return [];
        const subclassCards = [{
            ...item.toObject(),
            id: item._id,
            actor: item.actor,
            featureState: 1,
            featureList: item.system.foundationFeatures
        }];
        if (item.system.featureState >= 2) subclassCards.push({
            ...item.toObject(),
            id: item._id,
            actor: item.actor,
            featureState: 2,
            featureList: item.system.specializationFeatures
        });
        if (item.system.featureState >= 3) subclassCards.push({
            ...item.toObject(),
            id: item._id,
            actor: item.actor,
            featureState: 3,
            featureList: item.system.masteryFeatures
        });
        return subclassCards;
    }

    simulateUnarmedCard() {
        const action = this.actor.system.attack;
        const { id, name, img, description } = action;
        
        return {
            id, 
            name: _loc(name),
            img,
            type: 'weapon',
            actor: action.actor,
            effects: [],
            uuid: action.id,
            noButton: true,
            system: {
                attack: action,
                description,
                burden: 'oneHanded',
                tier: 0,
                constructor: {
                    DEFAULT_ICON: `modules/${MODULE_ID}/assets/icons/${this.actor.system.activeBeastform ? 'paw-solid-full.svg' : 'hand-fist-solid-full.svg'}`
                }
            }
        }
    }

    simulateActionRollCard() {
        return {
            id: foundry.utils.randomID(),
            name: _loc('DAGGERHEART.GENERAL.Roll.action'),
            img: this.actor.img,
            type: 'feature',
            actor: this.actor,
            effects: [],
            noButton: true,
            system: {
                description: _loc('DHDECKCARD.ACTOR.Companion.action.desc'),
                featureForm: 'action',
                actionsList: []

            },
            use: async event => {
                const companionSheet = game.system.api.applications.sheets.actors.Companion;
                const partner = this.actor.system.partner;
                if (!partner) return ui.notifications.warn('DAGGERHEART.UI.Notifications.partnerRequired', { localize: true });
                const config = {
                    event,
                    title: `${game.i18n.localize('DAGGERHEART.GENERAL.Roll.action')}: ${this.actor.name}`,
                    headerTitle: `Companion ${game.i18n.localize('DAGGERHEART.GENERAL.Roll.action')}`,
                    roll: {
                        trait: partner.system.spellcastModifierTrait?.key,
                        companionRoll: true
                    },
                    hasRoll: true
                };

                const result = await partner.diceRoll(config);
                companionSheet.prototype.consumeResource.call({ actor: this.actor }, result?.costs);
                result?.resourceUpdates.updateResources();
            }
        }
    }

    simulatePotentialAdversariesCard() {
        return {
            id: foundry.utils.randomID(),
            name: _loc('DAGGERHEART.ACTORS.Adversary.Embed.potentialAdversaries'),
            img: this.actor.img,
            type: 'potentialAdversaries',
            actor: this.actor,
            effects: [],
            noButton: true,
            system: {
                featureForm: 'special',
                actionsList: []
            },
            use: event => AdversariesSelectionDialog.create(this.actor, event)
        }
    }

    getBeastformCard() {
        const { uuid, id, name, img } = this.actor.system.activeBeastform;
        const features = this.actor.items
            .filter(i => this.actor.system.activeBeastform.system.featureIds.includes(i.id));
        return [{
            id, 
            name: _loc(name),
            img,
            type: 'beastform',
            actor: this.actor,
            effects: [],
            uuid,
            features,
            noButton: true,
            system: {
                advantageOn: this.actor.system.activeBeastform.system.advantageOn
            }
        }];
    }

    updateCardPosition() {
        this.cards.forEach(card => card.element.style = this.getCardStyle(
            this.cards.size,
            card,
            game.settings.get(MODULE_ID, 'frontPosition')
        ));
        this._setDeckSize();
    }

    getCardStyle(count, card, frontCardPosition = 'last') {
        const index = card.index;
        const spacing = this.element?.dataset.cardOverlap || game.settings.get(MODULE_ID, 'cardOverlap') || 55;
        const curvature = game.settings.get(MODULE_ID, 'deckStyle') === 'flat' ? 0
            : game.settings.get(MODULE_ID, 'deckCurvature') / 100;
        const maxRotation = 14 * curvature;
        const maxCurve = 45 * curvature;
        const center = (count - 1) / 2;
        const offset = index - center;
        const normalized = count > 1 ? offset / center : 0;
        
        // Horizontal positioning
        const translateX = offset * spacing - this.parent.cardWidth / 2;

        // Vertical curve
        const translateY = normalized ** 2 * (count === 2 ? 20 * curvature : maxCurve);

        // Rotation
        const rotate = normalized * maxRotation;

        const baseZ = this.getCardZIndex(count, index, frontCardPosition);

        return [
            `--translate-x: ${translateX}px`,
            `--translate-y: ${translateY}px`,
            `--rotate: ${rotate}deg`,
            `--base-z: ${baseZ}`
        ].join('; ');
    }

    getCardZIndex(count, index, position) {
        switch (position) {
            case 'first':
                return count - index;
            case 'middle': {
                const middle = Math.floor((count - 1) / 2);
                return count - Math.abs(index - middle);
            }
            case 'last':
            default:
                return index + 1;
        }
    }

    _getItemTypes() {
        return DHDeck.getItemTypes(this.actor.type);
    }

    static getItemTypes(actorType = 'character') {
        const setting = actorType === 'character' ? 'itemTypes' : 'itemTypesNPC';
        const typesSetting = game.settings.get(MODULE_ID, setting);
        const defaults = this.getDefaultItemTypes(actorType);
        const defaultOrder = typesSetting.length ? typesSetting : defaults;
        const typesMap = new Map(defaultOrder.map(item => [item.type, item]));

        const itemTypes = defaults
            .map(item => ({
                ...item,
                active: typesMap.get(item.type)?.active ?? item.active
            }));

        itemTypes.sort((a, b) => {
            const aIndex = defaultOrder.findIndex(item => item.type === a.type);
            const bIndex = defaultOrder.findIndex(item => item.type === b.type);

            return (aIndex === -1 ? Infinity : aIndex)
                - (bIndex === -1 ? Infinity : bIndex);
        });

        return itemTypes;
    }

    static getDefaultItemTypes(actorType = 'character') {
        const types = actorType === 'character'
            ? ['ancestry', 'community', 'class', 'subclass', 'domainCard', 'beastform', 'consumable', 'loot', 'armor', 'weapon']
            : ['feature', 'potentialAdversaries', 'weapon'];
        if (actorType === 'character') {
            types.push(...Item.TYPES.filter(type => !types.includes(type) && !['base', 'feature'].includes(type)));
        }
        return types.map(type => ({
            type,
            label: _loc(type === 'potentialAdversaries'
                ? 'DAGGERHEART.GENERAL.Tabs.potentialAdversaries' : `TYPES.Item.${type}`),
            active: !['loot', 'consumable'].includes(type)
        })).sort((a, b) => a.label.localeCompare(b.label));
    }

    _setDeckSize() {
        if (!this.element) return;
        // Measure the resting layout, independent of hover, selection and slide animations.
        const cardWidth = this.parent.cardWidth;
        const cardHeight = cardWidth * 7 / 5;
        let minX = -cardWidth / 2;
        let maxX = cardWidth / 2;
        let maxY = 0;
        for (const card of this.cards.values()) {
            const style = card.element.style;
            const x = parseFloat(style.getPropertyValue('--translate-x')) || 0;
            const y = parseFloat(style.getPropertyValue('--translate-y')) || 0;
            const angle = (parseFloat(style.getPropertyValue('--rotate')) || 0) * Math.PI / 180;
            for (const dx of [-cardWidth / 2, cardWidth / 2]) {
                for (const dy of [-cardHeight, 0]) {
                    const rotatedX = x + cardWidth / 2 + dx * Math.cos(angle) - dy * Math.sin(angle);
                    minX = Math.min(minX, rotatedX);
                    maxX = Math.max(maxX, rotatedX);
                    maxY = Math.max(maxY, y + cardHeight + dx * Math.sin(angle) + dy * Math.cos(angle));
                }
            }
        }
        this.element.style.width = `${maxX - minX}px`;
        this.element.style.height = `${this.cards.size ? maxY : 0}px`;
    }

    applyGradient(value) {
        if (!this.element) return;

        if (value === 0) {
            this.element.style.removeProperty('--card-gradient');
            this.element.classList.add('no-gradient');
            return;
        }

        this.element.classList.remove('no-gradient');
        this.element.style.setProperty('--card-gradient', `${100 - value}%`);
    }

    setVarStyle() {
        this.element.style.setProperty('--hover-y-value', `${game.settings.get(MODULE_ID, 'hoverY') * -1}rem`);
        const hoverScale = game.settings.get(MODULE_ID, 'hoverScaleEnabled')
            ? game.settings.get(MODULE_ID, 'hoverScale') : 1;
        this.element.style.setProperty('--hover-scale-value', hoverScale);
        this.element.style.setProperty('--selected-scale', `${game.settings.get(MODULE_ID, 'selectedCardScale')}`);
    }
}
