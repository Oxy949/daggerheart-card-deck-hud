// The Foundryborne Reload action describes the rule, but does not refill the weapon resource.
// Mark actions started from the HUD so this override does not affect ordinary sheet actions.
export const HUD_USE_EVENT = Symbol('daggerheart-card-deck-hud.use');

export function markHudUseEvent(event) {
    if (event && typeof event === 'object') event[HUD_USE_EVENT] = true;
}

function resourceMaximum(item) {
    const raw = item.system.resource?.max;
    if (raw === undefined || raw === null || raw === '') return NaN;

    const literal = Number(raw);
    if (Number.isFinite(literal)) return literal;
    if (typeof raw !== 'string') return NaN;

    // Match Daggerheart's item/actor formula handling for nonliteral resource maxima.
    const itemFormula = /item\.@/i.test(raw);
    const formula = itemFormula ? raw.replaceAll(/item\.@/gi, '@') : raw;
    const rollData = (itemFormula ? item.getRollData?.() : item.actor?.getRollData?.()) ?? {};
    try {
        const parsed = Roll.replaceFormulaData(formula, rollData);
        return Number(game.system.api.documents.DhActiveEffect.effectSafeEval(parsed));
    } catch {
        return NaN;
    }
}

export function onHudActionUse(action, config) {
    if (!config?.event?.[HUD_USE_EVENT]) return;

    const item = action?.item;
    if (item?.type !== 'weapon' || !item.system?.hasReload) return;

    // Identify the actual Reload action by its feature's actionIds, not its localized name.
    const isReloadAction = Object.values(item.system.itemFeatures ?? {}).some(feature =>
        feature?.value === 'reloading' && feature.actionIds?.includes(action.id)
    );
    if (!isReloadAction) return;

    const max = resourceMaximum(item);
    if (!Number.isFinite(max) || max < 1) {
        ui.notifications.warn('DHDECKCARD.ERRORS.ReloadMissingResource', { localize: true });
        return;
    }

    // Post-use fires after the action workflow and its resource costs, including Stress.
    // This restores the weapon without cancelling its normal effects or chat message.
    void item.update({ 'system.resource.value': max }).catch(error => {
        console.error('daggerheart-card-deck-hud | Could not reload weapon', error);
        ui.notifications.error('DHDECKCARD.ERRORS.ReloadFailed', { localize: true });
    });
}

export function registerReloadAction() {
    Hooks.on(`${CONFIG.DH?.id ?? 'daggerheart'}.postUseAction`, onHudActionUse);
}
