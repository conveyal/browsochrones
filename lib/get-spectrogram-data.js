/** Get data to render a spectrogram plot from browsochrones data */

import propagate from './propagation'

const MAX_TRIP_LENGTH = 120 // minutes

/**
 * Return data used to draw a spectrogram.
 * This is basically just an array of curves like so:
 * For each iteration you will have an array of
 *  [opportunities reachable in 1 minute,
 *   marginal opportunities reachable in 2 minutes,
 *   ...
 *   marginal opportunities reachable in 120 minutes]
 */
export default function getSpectrogramData ({origin, query, stopTreeCache, grid}) {
  const output = []
  for (let i = 0; i < origin.nMinutes; i++) output.push(new Uint32Array(MAX_TRIP_LENGTH))

  propagate({
    query,
    stopTreeCache,
    origin,
    callback: ({
      travelTimesForDest,
      x,
      y
    }) => {
      let gridx = x + query.west - grid.west
      let gridy = y + query.north - grid.north

      // off the grid, return
      if (gridx < 0 || gridy < 0 || gridx >= grid.width || gridy >= grid.height) return

      const val = grid.data[gridy * grid.width + gridx]

      for (let i = 0; i < travelTimesForDest.length; i++) {
        const time = travelTimesForDest[i]
        if (time === 255) continue // unreachable

        if (time < MAX_TRIP_LENGTH) {
          // time - 1 so areas reachable in 1 minute will be included in output[i][0]
          // TODO audit all the places we're flooring things
          output[i][time - 1] += val
        }
      }
    }})

  return output
}
