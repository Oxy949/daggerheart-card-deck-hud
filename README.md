# Daggerheart: Card Deck HUD

![Screenshot](https://github.com/user-attachments/assets/357eb808-fc43-4128-a063-444aa734379c)

Daggerheart, the TableTop version, comes with awesome cards, and Daggerheart Foundry system by Foundryborne added it for tooltip recently.
This module simulates the cards hand for the selected character, allowing you to "throw your card on the table" during your game !

It also create "card like style" for Items without a native one, like weapons, beastform, etc.

## Item Types

- Actor:
  - Ancestries
  - Communities
  - Classes
  - Subclasses (per rank)
  - Domain Cards
  - Equipments (Weapons, Armor, etc)
  - Base Attack
  - Beastform
- Adversary:
  - Features
  - Base Attack
- Companion:
  - Base Attack
  - Action Roll
- Environment:
  - Features
  - Potential Adversaries + Quick Drag&Drop Adversary dialog

If a card got any actions or features attached to it, it's then clickable.

## Deck Customization

The deck style can be customize in many ways.
Below few examples:
- Choose which types of items should be displayed in the hand
- Attach the HUD to the left, the middle (above Foundry hotbar), the right of the screen. Or set it to free to move it anywhere you want !
- Display cards deck flat or curved
- Adjust the hand curvature from 0% (flat) to 200%, and enable or disable enlargement on hover with a configurable scale.
- Automatically slide the hand down after a configurable idle delay, with a configurable distance. Hover a card edge or the controls to bring it back. Selected cards, dragging, and an open menu keep the hand expanded.
- Choose Auto, Dark, or Light card colors. Auto follows the Foundry interface theme.
- Increase/Decrease cards overlaping
- Add a gradient fade on cards when not hovered, from top or bottom, to fit better with character resources HUD.
- ...

All appearance and interaction settings are per client, under **Settings → Module Settings → Daggerheart: Card Deck HUD**, and apply without reloading.

## Playing a card

Drag a readied card out of the hand and release it over the game canvas. The card lifts out of the fan, follows the pointer, and plays an animation before invoking its normal Daggerheart action (including feature selection when needed). The card remains in the hand for future use; the system manages costs and usage limits.

Press **Escape**, or release over the hand, sidebar, or a dialog, to return the card without using it. Locked cards cannot be dragged, and cards in the vault or unequipped inventory must be readied first. Existing click and right-click behavior remains available. Disable **Drag Cards to Play** to turn off the gesture.

The interface includes English and Russian translations and respects the system's reduced motion preference.

## Development checks

Run `npm install` and `npx playwright install chromium` once, then use `npm run lint`, `npm run build`, and `npm test`. Browser tests exercise the real HUD, cards, settings, and styles with a small Foundry host fixture; an in-world check is still needed for system dialogs, rolls, and resource costs.

## Installation

Manifest URL: https://github.com/Dapoulp/daggerheart-card-deck-hud/releases/latest/download/module.json

### Requirements

- Foundry v14+
- Daggerheart system

## License

MIT License
