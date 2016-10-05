import fill from 'lodash.fill'

import {getNonTransitTime, ITERATION_WIDTH} from './origin'

/**
 * Get a travel time surface and accessibility results for a particular origin.
 * Pass in references to the query (the JS object stored in query.json), the stopTreeCache, the origin file, the
 * x and y origin point relative to the query, what parameter you want (BEST_CASE, WORST_CASE or MEDIAN),
 * and a cutoff for accessibility calculations. Returns a travel time/accessibility surface which can be used by isochoroneTile and accessibilityForCutoff
 */
export default function getSurface ({origin, query, stopTreeCache, which}) {
  const surface = new Uint8Array(query.width * query.height)
  const waitTimes = new Uint8Array(query.width * query.height)
  const inVehicleTravelTimes = new Uint8Array(query.width * query.height)

  const transitOffset = getTransitOffset(origin.data[0])

  // how many departure minutes are there. skip number of stops
  const nMinutes = origin.data[transitOffset + 1]
  const travelTimesForDest = new Uint8Array(nMinutes) // the total travel time per iteration to reach a particular destination
  const waitTimesForDest = new Uint8Array(nMinutes) // wait time per iteration for particular destination
  const inVehicleTravelTimesForDest = new Uint8Array(nMinutes) // in-vehicle travel time per destination

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
              inVehicleTravelTimesForDest[minute] = origin.data[offset + 1]
              waitTimesForDest[minute] = origin.data[offset + 2]

              if (origin.data[offset + 2] > 254) console.log(`data value ${origin.data[offset + 2]}`)
            }
          }
        }
      }

      // compute and set value for pixel
      surface[pixelIdx] = computePixelValue(which, travelTimesForDest)
      waitTimes[pixelIdx] = computePixelValue(which, waitTimesForDest)
      inVehicleTravelTimes[pixelIdx] = computePixelValue(which, inVehicleTravelTimesForDest)
    }
  }

  return {
    surface,
    waitTimes,
    inVehicleTravelTimes,
    query,
    nMinutes // TODO already present in query
  }
}

/**
 * Where is the transit portion of the origin data there are a certain number of pixels in each direction aroudn the origin with times in them. read the radius, multiply by two to get diameter, add one because there is a pixel in the center, square to get number of pixels, add one to skip the first value which gives radius, and or with to convert to 32-bit int.
 *
 * @param {Number} radius
 * @return {Number}
 */

export function getTransitOffset (radius) {
  return (Math.pow(radius * 2 + 1, 2) + 1) | 0
}

/**
 * Get the pixel value
 *
 * @param {String} which
 * @param {Uint8Array} travelTimes
 * @return {Number} pixelValue
 */

export function computePixelValue (which, travelTimes) {
  switch (which) {
    case 'BEST_CASE':
      return computeBestPixelValue(travelTimes)
    case 'MEDIAN':
      return computeMedianPixelValue(travelTimes)
    case 'WORST_CASE':
      return computeWorstPixelValue(travelTimes)
  }
}

/**
 * Compute best pixel value
 *
 * @param {Uint8Array} travelTimes
 * @return {Number} pixel
 */

export function computeBestPixelValue (travelTimes) {
  let pixel = 255
  for (let i = 0; i < travelTimes.length; i++) {
    pixel = Math.min(pixel, travelTimes[i])
  }
  return pixel
}

/**
 * Compute average pixel value
 *
 * @param {Uint8Array} travelTimes
 * @return {Number} pixel
 */

export function computeMedianPixelValue (travelTimes) {
  // NB there may be some 255 values (unreachable/infinity) here but that's fine as they'll
  // be sorted to the end of the list. If more than half of the values are infinite, the median will
  // be infinite, which is fine and correct as long as the travel times are being censored at a value
  // larger than the time cutoff used for accessibility.
  travelTimes.sort()

  if (travelTimes.length === 1) {
    return travelTimes[0]
  } else if (travelTimes.length % 2 === 1) {
    // odd number, find the middle, keeping in mind the fencepost problem
    return travelTimes[Math.floor(travelTimes.length / 2)]
  } else {
    let pos = travelTimes.length / 2
    // -1 because off-by-one
    return (travelTimes[pos] + travelTimes[pos - 1]) / 2
  }
}

/**
 * Compute worst pixel value
 *
 * @param {Uint8Array} travelTimes
 * @return {Number} pixel
 */

export function computeWorstPixelValue (travelTimes) {
  let pixel = 0
  for (let i = 0; i < travelTimes.length; i++) {
    pixel = Math.max(pixel, travelTimes[i])
  }
  return pixel
}
