/** A single controlled token takes priority; an unselected scene uses the user's assigned character. */
export function getHUDActor() {
    const tokens = canvas.tokens?.controlled ?? [];
    if (tokens.length > 1) return { actor: null, token: null };
    const token = tokens[0];
    if (token?.actor) return { actor: token.actor, token };
    return { actor: game.user?.character ?? null, token: null };
}
