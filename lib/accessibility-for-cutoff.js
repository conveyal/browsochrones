/**
 * Get the cumulative accessibility number for a cutoff from a travel time surface.
 * This function always calculates _average_ accessibility. Calculating best or worst case accessibility is computationally
 * complex because you must individually calculate accessibility for every minute, save all of those values, and then take a minumum.
 * (Saving the worst-case travel time to each pixel allows you to calculate a bound, but does not allow calculation of the true minimum, because
 * it is possible that all the worst-case travel times cannot appear simultaneously. Of course this comes back to the definition of your measure, and
 * how fungible you consider opportunities to be. )
 *
 * @param {Object} surface
 * @param {Object} grid
 * @returns {Number} accessibility
 */

export default function accessibilityForCutoff ({surface, grid}) {
  let query = surface.query
  let accessibility = 0

  for (let y = 0, pixel = 0; y < query.height; y++) {
    for (let x = 0; x < query.width; x++, pixel++) {
      let count = surface.access[pixel]

      // ignore unreached locations
      if (count === 0) continue

      let gridx = x + query.west - grid.west
      let gridy = y + query.north - grid.north

      // if condition below fails we're off the grid, value is zero, don't bother with calculations
      if (gridx >= 0 && gridx < grid.width && gridy >= 0 && gridy < grid.height) {
        // get value of this pixel from grid
        let val = grid.data[gridy * grid.width + gridx]
        let weight = count / surface.nMinutes
        accessibility += val * weight
      }
    }
  }

  return accessibility
}
