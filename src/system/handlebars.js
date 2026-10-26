export const preloadHandlebarsTemplates = async function () {
    return foundry.applications.handlebars.loadTemplates([
        'modules/daggerheart-card-deck-hud/templates/deck.hbs',
        'modules/daggerheart-card-deck-hud/templates/hand-sorting.hbs',
        'modules/daggerheart-card-deck-hud/templates/feature-selection-dialog.hbs',
        'modules/daggerheart-card-deck-hud/templates/adversaries-selection-dialog.hbs'
    ]);
}
