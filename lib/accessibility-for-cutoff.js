/**
 * Get the cumulative accessibility number for a cutoff from a travel time surface
 *
 * @param {Object} surface
 * @param {Number} cutoff
 * @param {String} which
 * @returns {Number} accessibility
 */

export default function accessibilityForCutoff ({cutoff, surface, which}) {
  let ret = new Map()
  for (let [name, access] of surface.access) {
    let accessibility = access.slice(cutoff * surface.nMinutes, (cutoff + 1) * surface.nMinutes)

    if (which === 'BEST_CASE') ret.set(name, accessibility.reduce(Math.max) | 0)
    else if (which === 'WORST_CASE') ret.set(name, accessibility.reduce(Math.min) | 0)
    else if (which === 'AVERAGE') ret.set(name, (accessibility.reduce((a, b) => a + b) / surface.nMinutes) | 0)
  }

  return ret
}
