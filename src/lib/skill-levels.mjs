export const SKILL_LEVELS = [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5];
export function skillLabel(level) {
  return ({ 2: '2.0 — Novice', 3: '3.0 — Intermediate', 4: '4.0 — Advanced', 5.5: '5.5+' })[level] ?? Number(level).toFixed(1);
}
