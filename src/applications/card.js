import FeatureSelectionDialog from './dialogs/feature-selection-dialog';
import { markHudUseEvent } from '../system/reloading';

const embedTemplates = new Map([
    ['class', 'systems/daggerheart/templates/components/card/subclass.hbs'],
    ['subclass', 'systems/daggerheart/templates/components/card/subclass.hbs'],
    ['default', 'systems/daggerheart/templates/components/card/domain.hbs']
]);

export default class DHCard {
    #selected = false;
    features = [];

    constructor(item, index) {
        this.id = foundry.utils.randomID();
        this.item = item;
        this.index = index;
        this.selected = false;
        this.element = null;
    }

    get selected() {
        return this.#selected;
    }

    set selected(value) {
        value = Boolean(value);

        if (this.#selected === value) return;

        this.#selected = value;
        this.element?.classList.toggle('selected', value);
    }

    get actor() {
        return this.item.actor;
    }

    get isLocked() {
        return this.actor.system.activeBeastform && ((this.item.type === 'weapon' && this.item.id !== this.actor.system.attack.id) || this.item.system?.type === 'spell');
    }

    static async create(item, index) {
        const card = new this(item, index);
        card.attachFeatures();
        card.element = await card.toEmbed();
        card.templateData = {
            path: item.system.constructor.embedTemplate ?? embedTemplates[item.type] ?? embedTemplates['default'],
            description: ''
        }
        return card;
    }

    async toEmbed() {
        let embed = (await this.item.system?.toEmbed?.()) ?? await this.simulateToEmbed();
        if (!embed) return;
        embed = embed instanceof HTMLCollection ? embed[0] : embed;        
        if (this.item.sourceUuid === 'Compendium.daggerheart.ancestries.Item.ed8BoLR4SHOpeV00') this.processExtraTweaks(embed);

        return await this.addWrapper(embed);
    }

    processExtraTweaks(embed) {
        const purposefulDesc = embed.querySelector('.item-description-inner-container p');
        const purposefulBr = embed.querySelector('.item-description-inner-container p br');
        purposefulDesc?.remove();
        purposefulBr?.remove();
    }

    async addWrapper(card) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('dh-card-wrapper');
        wrapper.dataset.cardId = this.id;
        wrapper.setAttribute('data-item-id', this.item.uuid);
        wrapper.setAttribute('data-action', 'useCard');
        wrapper.setAttribute('data-locked', !!this.isLocked);

        const hoverLayout = this.addHoverLayout();

        wrapper.append(card, hoverLayout);

        return wrapper;
    }

    async simulateToEmbed() {
        let item = this.item;

        const embedTemplate = item.system.constructor?.embedTemplate ?? embedTemplates.get(item.type) ?? embedTemplates.get('default');
        let desc = item.system.description ?? null;
        const props = [];
        const features = [];
        
        if (['armor', 'weapon'].includes(item.type)) {
            if (item.system.tier) props.push({ label: 'DAGGERHEART.GENERAL.Tiers.singular', value: item.system.tier });
            props.push(...(item.type === 'armor' ? 
                [
                    { label: 'DAGGERHEART.ITEMS.Armor.baseScore', value: `${item.system.armor.current} / ${item.system.armor.max}` },
                    { label: 'DAGGERHEART.ITEMS.Armor.baseThresholds.base', value: `${item.system.baseThresholds.major} / ${item.system.baseThresholds.severe}` }
                ]
                : [
                    { label: 'DAGGERHEART.GENERAL.Trait.single', value: item.system.attack.roll.trait ? _loc(`DAGGERHEART.CONFIG.Traits.${item.system.attack.roll.trait}.name`) : null },
                    { label: 'DAGGERHEART.GENERAL.damage', value: Roll.replaceFormulaData(item.system.attack.damage.main.value.getFormula(), item.actor.getRollData()) },
                    { label: 'DAGGERHEART.GENERAL.burden', value: _loc(`DAGGERHEART.CONFIG.Burden.${item.system.burden}`) },
                    { label: 'DAGGERHEART.GENERAL.type', value: item.system.secondary ? _loc('DHDECKCARD.GENERAL.Tags.secondary') : _loc('DHDECKCARD.GENERAL.Tags.primary') },
                    { label: 'DAGGERHEART.GENERAL.range', value: _loc(`DAGGERHEART.CONFIG.Range.${item.system.attack.range}.name`) }
                ]
            ));
        }

        // Specific type datas
        let extraDatas;
        let classe;

        switch (item.type) {
            case 'class':
                classe = 'class';
                // falls through
            case 'subclass':
                const classItem = item.system.linkedClass ? await fromUuid(item.system.linkedClass) : item;
                const domains = CONFIG.DH.DOMAIN.allDomains();
                const classDomains = classItem.system.domains?.slice(0, 2) ?? []; // 2 max for displays
                extraDatas = {
                    classItem,
                    domain1: foundry.utils.mergeObject({ color: 'black' }, domains[classDomains[0]] ?? {}),
                    domain2: foundry.utils.mergeObject({ color: 'black' }, domains[classDomains[1]] ?? domains[classDomains[0]] ?? {})
                };
                break;
            case 'beastform':
                extraDatas = {
                    domain: {color: '#666666'},
                    cardType: { label: `TYPES.Item.${item.type}` }
                };
                classe = 'beastform';
                if (Object.keys(item.system.advantageOn).length) features.push({ label: _loc('DAGGERHEART.ITEMS.Beastform.FIELDS.advantageOn.label'), value: Object.values(item.system.advantageOn).map(a => a.value).join(', ') });
                break;
            case 'potentialAdversaries':
                desc = await this.createPotentialAdversaries();
                // falls through
            case 'feature':
                extraDatas = {
                    domain: {color: '#00288f'},
                    cardType: { label: `DAGGERHEART.CONFIG.FeatureForm.${item.system.featureForm}` }
                };
                classe = 'feature';
                if (item.effects.size) features.push(...item.effects
                    .map(effect => ({ label: effect.name, value: effect.description })));
                break;
            default:
                extraDatas = {
                    domain: {color: '#666666', label: _loc(`TYPES.Item.${item.type}`), src: item.system.constructor.DEFAULT_ICON},
                    cardType: { label: `TYPES.Item.${item.type}` }
                };
                classe = 'equipment';
                if (item.effects.size) features.push(...item.effects
                    .map(effect => ({ label: effect.name, value: effect.description })));
                break;
        }

        // Add Features & Actions for description
        if (this.features.length) features.push(...this.features
            .map(feature => ({ label: feature.name, value: feature.system.description })));
        if (item.system.actions?.size) features.push(...item.system.actions
            .map(action => ({ label: action.name, value: action.description })));

        const content = await foundry.applications.handlebars.renderTemplate(embedTemplate, {
            item,
            description: await this.createDescription({desc, props, features}),
            ...extraDatas
        });
        
        const container = document.createElement('div');
        container.innerHTML = content;

        const element = container.querySelector('div.dh-card');
        if (classe) element.classList.add(classe);

        return element;
    }

    async createDescription({ desc = null, props = [], features = [] } = {}) {
        const descContainer = document.createElement('div');

        // Description
        if (desc) descContainer.innerHTML = desc;

        // Equipment properties
        if (props.length) {
            const propsContainer = document.createElement('div');
            propsContainer.classList.add('equipment-details');
            for (const prop of props) {
                prop.value ||= _loc('DHDECKCARD.GENERAL.NoDesc');
                const propContainer = document.createElement('div');
                propContainer.innerHTML = `<strong>${_loc(prop.label)}:</strong> ${prop.value}`;
                propsContainer.append(propContainer);
            }
            descContainer.append(propsContainer);
        }

        // Features & Actions
        if (features.length) {
            const featuresContainer = document.createElement('div');
            featuresContainer.classList.add('features', 'item-description-outer-container');
            const itemContainer = document.createElement('div');
            itemContainer.classList.add('item-description-container');
            for (const feature of features) {
                feature.value ||= _loc('DHDECKCARD.GENERAL.NoDesc');
                const featureContainer = document.createElement('div');
                featureContainer.classList.add('feature', 'item-description-inner-container');
                featureContainer.innerHTML = `<strong>${feature.label}:</strong> ${feature.value}`;
                itemContainer.append(featureContainer);
            }
            featuresContainer.append(itemContainer);
            descContainer.append(featuresContainer);
        }
                
        const enrichDesc = await foundry.applications.ux.TextEditor.implementation.enrichHTML(descContainer.innerHTML, {
            relativeTo: this.actor,
            rollData: this.actor.getRollData(),
            secrets: this.actor.isOwner
        });

        return enrichDesc;
    }

    async createPotentialAdversaries() {
        const descContainer = document.createElement('div');
        const potentialContainer = document.createElement('div');
        potentialContainer.classList.add('features', 'item-description-outer-container');
        const potentialGroups = Object.values(this.actor.system.potentialAdversaries);
        for (const group of potentialGroups) {
            const groupContainer = document.createElement('fieldset');
            groupContainer.classList.add('item-description-container', 'glassy', 'card-potential-fieldset');
            const groupLabel = document.createElement('legend');
            groupLabel.classList.add('card-potential-name');
            groupLabel.textContent = group.label;
            groupContainer.append(groupLabel);
            for (const adversary of group.adversaries) {
                const actor = await fromUuid(adversary.uuid);
                const adversaryContainer = document.createElement('div');
                adversaryContainer.classList.add('feature', 'item-description-inner-container', 'card-potential-adversary');
                const adversaryImg = document.createElement('img');
                adversaryImg.src = actor.img;
                const adversaryName = document.createElement('p');
                adversaryName.textContent = actor.name;
                adversaryContainer.append(adversaryImg, adversaryName);
                groupContainer.append(adversaryContainer);
            }

            potentialContainer.append(groupContainer);
        }
        descContainer.append(potentialContainer);
        return descContainer.innerHTML;
    }

    get sourceDocument() {
        if (this.item.sheet) return this.item;
        const ownedItem = this.actor.items?.get?.(this.item.id);
        if (ownedItem) return ownedItem;
        const document = this.item.uuid?.includes('.') ? fromUuidSync(this.item.uuid) : null;
        return document ?? this.actor;
    }

    async openDocument() {
        return this.sourceDocument?.sheet?.render({ force: true });
    }

    addHoverLayout() {
        const hoverLayout = document.createElement('div');
        hoverLayout.classList.add('hover-layout');
        return hoverLayout;
    }

    attachFeatures() {
        const features = this.getItemFeatures().map(f => f.uuid);
        if (features.length) this.features = this.actor.items.filter(i => features.includes(i.sourceUuid));
    }

    getItemFeatures() {
        const item = this.item;
        switch (item.type) {
            case 'class':
                const hopeFeatures = item.system.hopeFeatures.map(f => ({ _id: f._id, uuid: f.uuid, type: 'hope', originName: item.name}));
                const classFeatures = item.system.classFeatures.map(f => ({ _id: f._id, uuid: f.uuid, type: 'class', originName: item.name}));
                return [...hopeFeatures, ...classFeatures];
            case 'ancestry':
                const primaryFeatures = { _id: item.system.primaryFeature._id, uuid: item.system.primaryFeature.uuid, type: 'primary', originName: item.name};
                const secondaryFeatures = { _id: item.system.secondaryFeature._id, uuid: item.system.secondaryFeature.uuid, type: 'secondary', originName: item.name};
                return [primaryFeatures, secondaryFeatures];
            case 'community':
                return item.system.features.map(f => ({ _id: f._id, uuid: f.uuid, originName: item.name}));
            case 'subclass':
                return item.featureList;
            case 'beastform':
                return item.features
            default:
                return [];
        }
    }

    toggleSelected() {
        this.selected = !this.selected;
    }

    #hasActions(item) {
        const actions = item.system?.actionsList ?? item.system?.actions;
        return Boolean(actions?.size || actions?.length);
    }

    async #sendToChat() {
        // Subclass rank cards wrap item data rather than the original Item document.
        const item = typeof this.item.toChat === 'function' ? this.item : this.actor.items?.get?.(this.item.id);
        if (typeof item?.toChat === 'function') return item.toChat(item.uuid);

        // Synthetic cards, such as beastforms, have no Item chat method: share their visible embed.
        const content = this.element.querySelector('.dh-card').cloneNode(true);
        content.querySelectorAll('.secret').forEach(element => element.remove());
        const messageClass = getDocumentClass('ChatMessage');
        return messageClass.create({
            speaker: messageClass.getSpeaker({ actor: this.actor }),
            content: content.outerHTML
        });
    }

    async use(event) {
        markHudUseEvent(event);
        const customAction = this.item.noButton && typeof this.item.use === 'function';
        if (typeof this.item.use === 'function' && (this.#hasActions(this.item) || customAction)) {
            await this.item.use(event);
        } else if (this.actor.system.attack && this.item.id === this.actor.system.attack.id) {
            await this.actor.system.attack.use(event);
        }
        else {
            const features = this.features.filter(feature => this.#hasActions(feature));
            if (features.length) {
                let feature = features[0];
                if (features.length > 1 && !event?.shiftKey) {
                    // Feature Selection Dialog
                    feature = await FeatureSelectionDialog.create(this, event);
                }
                if (feature) await feature.use(event);
            } else await this.#sendToChat();
        }

        if (this.selected) this.selected = false;
    }

    async toggleEquipped() {
        if (this.item.system.equipped) {
            await this.item.update({ 'system.equipped': false });
            return;
        }

        switch (this.item.type) {
            case 'armor':
                const currentArmor = this.actor.system.armor;
                if (currentArmor) {
                    await currentArmor.update({ 'system.equipped': false });
                }

                await this.item.update({ 'system.equipped': true });
                break;
            case 'weapon':
                if (this.actor.activeBeastform) {
                    return ui.notifications.warn(
                        game.i18n.localize('DAGGERHEART.UI.Notifications.beastformEquipWeapon')
                    );
                }

                await this.actor.system.constructor.unequipBeforeEquip.bind(this.actor.system)(this.item);

                await this.item.update({ 'system.equipped': true });
                break;
        }
    }
}
