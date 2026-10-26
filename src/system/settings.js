import { MODULE_ID } from './constants';
import { DHCardDeckHUD } from '../applications/daggerheart-card-deck-hud';
import HandSorting from '../applications/hand-sorting';

export function registerSettings() {
    game.settings.registerMenu(MODULE_ID, 'handSorting', {
        name: 'DHDECKCARD.SETTINGS.HandSorting.name',
        label: 'DHDECKCARD.SETTINGS.HandSorting.label',
        hint: 'DHDECKCARD.SETTINGS.HandSorting.hint',
        icon: 'fa-solid fa-arrow-down-wide-short',
        type: HandSorting,
        restricted: false
    });

    game.settings.register(MODULE_ID, 'handView', {
        name: 'DHDECKCARD.SETTINGS.HandView.label',
        hint: 'DHDECKCARD.SETTINGS.HandView.hint',
        scope: 'client',
        config: true,
        type: String,
        choices: {
            loadout: 'DHDECKCARD.SETTINGS.HandView.options.loadout',
            vault: 'DHDECKCARD.SETTINGS.HandView.options.vault',
            equipment: 'DHDECKCARD.SETTINGS.HandView.options.equipment'
        },
        default: 'loadout',
        onChange: () => DHCardDeckHUD.instance?.createDeck()
    });
    game.settings.register(MODULE_ID, 'disableHUD', {
        name: 'DHDECKCARD.SETTINGS.DisableHUD.label',
        hint: 'DHDECKCARD.SETTINGS.DisableHUD.hint',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: async value => {
            if (value) await DHCardDeckHUD.destroy();
            else await DHCardDeckHUD.create();
        }
    });

    game.settings.register(MODULE_ID, 'hideHotbar', {
        name: 'DHDECKCARD.SETTINGS.HideHotbar.label',
        hint: 'DHDECKCARD.SETTINGS.HideHotbar.hint',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: value => ui.hotbar.element.classList.toggle('hidden', value)
    });

    game.settings.register(MODULE_ID, 'hideDescription', {
        name: 'DHDECKCARD.SETTINGS.HideDescription.label',
        hint: 'DHDECKCARD.SETTINGS.HideDescription.hint',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: value => DHCardDeckHUD.instance?.parts?.deck?.classList.toggle('description-hidden', value)
    });

    game.settings.register(MODULE_ID, 'autoHide', {
        name: 'DHDECKCARD.SETTINGS.AutoHide.label',
        hint: 'DHDECKCARD.SETTINGS.AutoHide.hint',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => DHCardDeckHUD.instance?.interactions?.refresh()
    });

    game.settings.register(MODULE_ID, 'autoHideDelay', {
        name: 'DHDECKCARD.SETTINGS.AutoHideDelay.label',
        hint: 'DHDECKCARD.SETTINGS.AutoHideDelay.hint',
        scope: 'client',
        config: true,
        type: Number,
        range: { min: 0, max: 30, step: 0.5 },
        default: 3,
        onChange: () => DHCardDeckHUD.instance?.interactions?.refresh()
    });

    game.settings.register(MODULE_ID, 'autoHideDistance', {
        name: 'DHDECKCARD.SETTINGS.AutoHideDistance.label',
        hint: 'DHDECKCARD.SETTINGS.AutoHideDistance.hint',
        scope: 'client',
        config: true,
        type: Number,
        range: { min: -600, max: 600, step: 1 },
        default: 180,
        onChange: () => DHCardDeckHUD.instance?.interactions?.refresh()
    });

    game.settings.register(MODULE_ID, 'cardTheme', {
        name: 'DHDECKCARD.SETTINGS.CardTheme.label',
        hint: 'DHDECKCARD.SETTINGS.CardTheme.hint',
        scope: 'client',
        config: true,
        type: String,
        choices: {
            auto: 'DHDECKCARD.SETTINGS.CardTheme.options.auto',
            dark: 'DHDECKCARD.SETTINGS.CardTheme.options.dark',
            light: 'DHDECKCARD.SETTINGS.CardTheme.options.light'
        },
        default: 'auto',
        onChange: () => DHCardDeckHUD.instance?.interactions?.refresh()
    });

    game.settings.register(MODULE_ID, 'dragToPlay', {
        name: 'DHDECKCARD.SETTINGS.DragToPlay.label',
        hint: 'DHDECKCARD.SETTINGS.DragToPlay.hint',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true
    });
    
    game.settings.register(MODULE_ID, 'deckPosition', {
        name: 'DHDECKCARD.SETTINGS.DeckPosition.label',
        hint: 'DHDECKCARD.SETTINGS.DeckPosition.hint',
        scope: 'client',
        config: true,
        type: String,
        choices: {
            left: 'DHDECKCARD.SETTINGS.DeckPosition.options.left',
            center: 'DHDECKCARD.SETTINGS.DeckPosition.options.center',
            right: 'DHDECKCARD.SETTINGS.DeckPosition.options.right',
            custom: 'DHDECKCARD.SETTINGS.DeckPosition.options.custom'
        },
        default: 'center',
        onChange: async () => {
            await DHCardDeckHUD.destroy();
            await DHCardDeckHUD.create();
        }
    });

    game.settings.register(MODULE_ID, 'lockPosition', {
        name: 'DHDECKCARD.SETTINGS.LockPosition.label',
        hint: 'DHDECKCARD.SETTINGS.LockPosition.hint',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: value => DHCardDeckHUD.instance?.setLockPosition()
    });
    
    game.settings.register(MODULE_ID, 'deckStyle', {
        name: 'DHDECKCARD.SETTINGS.DeckStyle.label',
        hint: 'DHDECKCARD.SETTINGS.DeckStyle.hint',
        scope: 'client',
        config: true,
        type: String,
        choices: {
            curved: 'DHDECKCARD.SETTINGS.DeckStyle.options.curved',
            flat: 'DHDECKCARD.SETTINGS.DeckStyle.options.flat'
        },
        default: 'curved',
        onChange: value => {
            DHCardDeckHUD.instance?.deck?.element?.classList.toggle('flat', value === 'flat');
            DHCardDeckHUD.instance?.deck?.updateCardPosition();
        }
    });

    game.settings.register(MODULE_ID, 'deckCurvature', {
        name: 'DHDECKCARD.SETTINGS.DeckCurvature.label',
        hint: 'DHDECKCARD.SETTINGS.DeckCurvature.hint',
        scope: 'client',
        config: true,
        type: Number,
        range: { min: 0, max: 200, step: 5 },
        default: 100,
        onChange: () => DHCardDeckHUD.instance?.deck?.updateCardPosition()
    });
    
    game.settings.register(MODULE_ID, 'frontPosition', {
        name: 'DHDECKCARD.SETTINGS.FrontPosition.label',
        hint: 'DHDECKCARD.SETTINGS.FrontPosition.hint',
        scope: 'client',
        config: true,
        type: String,
        choices: {
            first: 'DHDECKCARD.SETTINGS.FrontPosition.options.first',
            middle: 'DHDECKCARD.SETTINGS.FrontPosition.options.middle',
            last: 'DHDECKCARD.SETTINGS.FrontPosition.options.last'
        },
        default: 'last',
        onChange: () => DHCardDeckHUD.instance?.deck?.updateCardPosition()
    });

    game.settings.register(MODULE_ID, 'cardWidth', {
        name: 'Card Width',
        scope: 'client',
        config: true,
        type: Number,
        default: 5,
        range: {
            min: 1,
            max: 10,
            step: 1
        }
    });
    
    game.settings.register(MODULE_ID, 'cardOverlap', {
        name: 'DHDECKCARD.SETTINGS.CardOverlap.label',
        hint: 'DHDECKCARD.SETTINGS.CardOverlap.hint',
        scope: 'client',
        config: true,
        type: Number,
        range: {
            min: 20,
            max: 150,
            step: 5
        },
        default: 55
    });
    
    game.settings.register(MODULE_ID, 'hoverY', {
        name: 'DHDECKCARD.SETTINGS.HoverY.label',
        hint: 'DHDECKCARD.SETTINGS.HoverY.hint',
        scope: 'client',
        config: true,
        type: Number,
        range: {
            min: 0,
            max: 5,
            step: 0.25
        },
        default: 1.25,
        onChange: value => DHCardDeckHUD.instance?.parts?.deck?.style.setProperty('--hover-y-value', `${value * -1}rem`)
    });
    
    game.settings.register(MODULE_ID, 'hoverScaleEnabled', {
        name: 'DHDECKCARD.SETTINGS.HoverScaleEnabled.label',
        hint: 'DHDECKCARD.SETTINGS.HoverScaleEnabled.hint',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true,
        onChange: () => DHCardDeckHUD.instance?.deck?.setVarStyle()
    });

    game.settings.register(MODULE_ID, 'hoverScale', {
        name: 'DHDECKCARD.SETTINGS.HoverScale.label',
        hint: 'DHDECKCARD.SETTINGS.HoverScale.hint',
        scope: 'client',
        config: true,
        type: Number,
        range: {
            min: 1,
            max: 3,
            step: 0.1
        },
        default: 1.1,
        onChange: () => DHCardDeckHUD.instance?.deck?.setVarStyle()
    });
    
    game.settings.register(MODULE_ID, 'selectedCardScale', {
        name: 'DHDECKCARD.SETTINGS.SelectedCardScale.label',
        hint: 'DHDECKCARD.SETTINGS.SelectedCardScale.hint',
        scope: 'client',
        config: true,
        type: Number,
        range: {
            min: 1,
            max: 5,
            step: 0.25
        },
        default: 1.5,
        onChange: value => DHCardDeckHUD.instance?.parts?.deck?.style.setProperty('--selected-scale', `${value}`)
    });
    
    game.settings.register(MODULE_ID, 'deckBorderMargin', {
        name: 'DHDECKCARD.SETTINGS.DeckBorderMargin.label',
        hint: 'DHDECKCARD.SETTINGS.DeckBorderMargin.hint',
        scope: 'client',
        config: true,
        type: Number,
        range: {
            min: 0,
            max: 500,
            step: 5
        },
        default: 0
    });
    
    game.settings.register(MODULE_ID, 'deckBottomMargin', {
        name: 'DHDECKCARD.SETTINGS.DeckBottomMargin.label',
        hint: 'DHDECKCARD.SETTINGS.DeckBottomMargin.hint',
        scope: 'client',
        config: true,
        type: Number,
        range: {
            min: -50,
            max: 500,
            step: 5
        },
        default: 0
    });
    
    game.settings.register(MODULE_ID, 'directAction', {
        name: 'DHDECKCARD.SETTINGS.HideHotbar.label',
        hint: 'DHDECKCARD.SETTINGS.HideHotbar.hint',
        scope: 'client',
        config: false,
        type: Boolean,
        default: false
    });
    
    game.settings.register(MODULE_ID, 'cardGradient', {
        name: 'DHDECKCARD.SETTINGS.CardGradient.label',
        hint: 'DHDECKCARD.SETTINGS.CardGradient.hint',
        scope: 'client',
        config: true,
        type: Number,
        range: {
            min: 0,
            max: 100,
            step: 5
        },
        default: 0
    });

    game.settings.register(MODULE_ID, 'invertGradient', {
        name: 'DHDECKCARD.SETTINGS.InvertGradient.label',
        hint: 'DHDECKCARD.SETTINGS.InvertGradient.hint',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: value => DHCardDeckHUD.instance?.parts?.deck?.classList.toggle('invert-gradient', value)
    });

    game.settings.register(MODULE_ID, 'itemTypes', {
        scope: 'client',
        config: false,
        type: Array,
        default: [],
        onChange: () => {
            if (DHCardDeckHUD.instance?.isCharacter) return DHCardDeckHUD.instance.createDeck();
        }
    });

    game.settings.register(MODULE_ID, 'itemTypesNPC', {
        scope: 'client',
        config: false,
        type: Array,
        default: [],
        onChange: () => {
            const hud = DHCardDeckHUD.instance;
            if (hud?.actor && !hud.isCharacter) return hud.createDeck();
        }
    });

    game.settings.register(MODULE_ID, 'deckCustomPosition', {
        scope: 'client',
        config: false,
        type: Object,
        default: {
            left: null,
            top: null
        }
    });
}
