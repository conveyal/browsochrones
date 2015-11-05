/** Get the cumulative accessibility number for a cutoff from a travel time surface */
export default function accessibilityForCutoff (surface, cutoff, which) {
  let accessibility = surface.access.slice(cutoff * surface.nMinutes, (cutoff + 1) * surface.nMinutes)

  if (which === 'BEST_CASE') return accessibility.reduce(Math.max) | 0
  else if (which === 'WORST_CASE') return accessibility.reduce(Math.min) | 0
  else if (which === 'AVERAGE') return (accessibility.reduce((a, b) => a + b) / surface.nMinutes) | 0
}