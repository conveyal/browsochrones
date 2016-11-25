/**
 * Perform propagation from an origin to destination cells, calling a callback to summarize the data.
 *
 * This seems like it's overly complicated, but I don't think there's an easier way to have this code
 * used both to create surfaces/isochrones and spectrogram data, which are different summaries of the data.
 *
 * The callback will be called with the following, once for each destination pixel
 *   travelTimesForDest: Travel times at each iteration
 *   walkTimesForDest: Walk times at each iteration
 *   inVehicleTravelTimesForDest: In vehicle travel times at each iteration
 *   waitTimesForDest: Wait times at each iteration
 *   x: X coordinate of grid for this destination
 *   y: Y coordinate of grid for this destination
 */

import fill from 'lodash.fill'
import {getNonTransitTime, ITERATION_WIDTH} from './origin'

export default function propagate ({ query, stopTreeCache, origin, callback }) {
  const {nMinutes} = origin
  const travelTimesForDest = new Uint8Array(nMinutes) // the total travel time per iteration to reach a particular destination
  const waitTimesForDest = new Uint8Array(nMinutes) // wait time per iteration for particular destination
  const inVehicleTravelTimesForDest = new Uint8Array(nMinutes) // in-vehicle travel time per destination
  const walkTimesForDest = new Uint8Array(nMinutes)

  // x and y refer to pixel not origins here
  // loop over rows first
  for (let y = 0, pixelIdx = 0, stcOffset = 0; y < query.height; y++) {
    for (let x = 0; x < query.width; x++, pixelIdx++) {
      const nStops = stopTreeCache.data[stcOffset++]

      // can we reach this pixel without riding transit?
      const nonTransitTime = getNonTransitTime(origin, {x, y})

      // fill with unreachable, or the walk distance
      fill(travelTimesForDest, nonTransitTime)
      fill(waitTimesForDest, 255)
      fill(inVehicleTravelTimesForDest, 255)
      fill(walkTimesForDest, nonTransitTime) // when the origin is within walking distance and
        // walking is the fastest way to reach the destination, _everything_ is walk time

      for (let stopIdx = 0; stopIdx < nStops; stopIdx++) {
        // read the stop ID
        const stopId = stopTreeCache.data[stcOffset++]

        // read the time (minutes)
        const time = stopTreeCache.data[stcOffset++]

        for (let minute = 0; minute < nMinutes; minute++) {
          const offset = origin.index[stopId] + minute * ITERATION_WIDTH
          const travelTimeToStop = origin.data[offset]

          if (travelTimeToStop !== -1) {
            const travelTimeToPixel = travelTimeToStop + time

            // no need to check that travelTimeToPixel < 255 as travelTimesForDest[minute] is preinitialized to the nontransit time or 255
            if (travelTimesForDest[minute] > travelTimeToPixel) {
              travelTimesForDest[minute] = travelTimeToPixel
              const inVehicle = inVehicleTravelTimesForDest[minute] = origin.data[offset + 1]
              const wait = waitTimesForDest[minute] = origin.data[offset + 2]
              // NB when we're talking about a particular trip, then walk + wait + inVehicle == total
              // However if you calculate summary statistics for each of these individually, that may
              // not be true. So we need to calculate walk here and explicitly calculate summary stats about it.
              const walkTime = travelTimeToPixel - wait - inVehicle
              walkTimesForDest[minute] = walkTime
            }
          }
        }
      }

      callback({
        travelTimesForDest,
        walkTimesForDest,
        inVehicleTravelTimesForDest,
        waitTimesForDest,
        x,
        y
      })
    }
  }
}
