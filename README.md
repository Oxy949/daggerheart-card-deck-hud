# Daggerheart: Card Deck HUD

![Screenshot](https://github.com/user-attachments/assets/357eb808-fc43-4128-a063-444aa734379c)

Daggerheart, the TableTop version, comes with awesome cards, and Daggerheart Foundry system by Foundryborne added it for tooltip recently.
This module simulates the cards hand for the selected character, allowing you to "throw your card on the table" during your game !

With no token selected, the hand uses the character assigned to your Foundry user. Selecting one token takes priority; deselecting it returns to your assigned character. Changes to your character assignment and scene are picked up automatically. Multiple selected tokens hide the hand.

When the displayed actor changes, the old hand slides down before the new cards slide up. Ordinary item and resource updates refresh the same hand without replaying that transition. Hover enlargement waits until the hand has finished moving, and reduced motion preferences are respected.

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

Click a card to use its available actions or share it in chat if it has none.

## Deck Customization

The deck style can be customize in many ways.
Below few examples:
- Choose which types of items should be displayed in the hand
- Attach the HUD to the left, the middle (above Foundry hotbar), the right of the screen. Or set it to free to move it anywhere you want !
- Display cards deck flat or curved
- Adjust the hand curvature from 0% (flat) to 200%, and enable or disable enlargement on hover with a configurable scale.
- Automatically slide the hand after a configurable idle delay by the exact configured distance in pixels. Positive values move it down, negative values move it up. Hover a visible part of a card to bring it back. Choose an offset that leaves part of a card visible if you want to reopen the hand by hovering. Selected cards and dragging keep the hand expanded.
- Choose Auto, Dark, or Light card colors. Auto follows the Foundry interface theme.
- Increase/Decrease cards overlaping
- Add a gradient fade on cards when not hovered, from top or bottom, to fit better with character resources HUD.
- ...

All appearance and interaction settings are per client, under **Settings → Module Settings → Daggerheart: Card Deck HUD**, and apply without reloading.

Open **Configure Hand** in the module settings to change the order and visibility of card types. Characters and NPCs have separate lists. Drag rows or use the arrow buttons, then save; existing ordering preferences are retained. **Displayed Character Cards** switches between the readied hand, vault, and unequipped items.

The hand has no control buttons. In **Free** positioning mode, hold **Alt** and drag a card to move the whole hand. **Lock Hand Position** prevents accidental movement.

## Playing a card

Drag a readied card out of the hand and release it over the game canvas. The card lifts out of the fan, follows the pointer, and plays an animation before invoking its normal Daggerheart action (including feature selection when needed). A card without available actions is sent to chat instead. It then fades back into the hand for future use; the system manages costs and usage limits.

Press **Escape**, or release over the hand, sidebar, or a dialog, to return the card without using it. Locked cards cannot be dragged, and cards in the vault or unequipped inventory must be readied first. Click to use a card, or **right-click** to open its original document. Generated cards resolve to their source item or effect, or to the actor sheet for actions without a separate document. Prepare vault cards and equip items through their documents or the character sheet. Disable **Drag Cards to Play** to turn off the gesture.

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
