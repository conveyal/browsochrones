import fill from 'lodash.fill'

import {getNonTransitTime} from './origin'

/**
 * Get a travel time surface and accessibility results for a particular origin.
 * Pass in references to the query (the JS object stored in query.json), the stopTreeCache, the origin file, the
 * x and y coordinates of the origin relative to the query, what parameter you want (BEST_CASE, WORST_CASE or AVERAGE),
 * and a cutoff for accessibility calculations. Returns a travel time/accessibility surface which can be used by isochoroneTile and accessibilityForCutoff
 */
export default function getSurface ({cutoff = 60, origin, query, stopTreeCache, which}) {
  const surface = new Uint8Array(query.width * query.height)

  const transitOffset = getTransitOffset(origin.data[0])

  // how many departure minutes are there. skip number of stops
  const nMinutes = origin.data[transitOffset + 1]
  const travelTimes = new Uint8Array(nMinutes)

  // store the number of minutes at which each cell is reached within the given cutoff
  // so we can calculate accessibility with arbitrary grids later
  const access = new Uint8Array(query.width * query.height)

  // x and y refer to pixel coordinates not origins here
  // loop over rows first
  for (let y = 0, pixelIdx = 0, stcOffset = 0; y < query.height; y++) {
    for (let x = 0; x < query.width; x++, pixelIdx++) {
      const nStops = stopTreeCache.data[stcOffset++]

      // can we reach this pixel without riding transit?
      const nonTransitTime = getNonTransitTime(origin, {x, y})

      // fill with unreachable, or the walk distance
      fill(travelTimes, nonTransitTime)

      for (let stopIdx = 0; stopIdx < nStops; stopIdx++) {
        // read the stop ID
        const stopId = stopTreeCache.data[stcOffset++]

        // read the time (minutes)
        const time = stopTreeCache.data[stcOffset++]

        for (let minute = 0; minute < nMinutes; minute++) {
          const offset = origin.index[stopId] + minute * 2 // * 2 because path info is included as well
          const travelTimeToStop = origin.data[offset]

          if (travelTimeToStop !== -1) {
            const travelTimeToPixel = travelTimeToStop + time

            // no need to check that travelTimeToPixel < 255 as travelTimes[minute] is preinitialized to 255
            if (travelTimes[minute] > travelTimeToPixel) travelTimes[minute] = travelTimeToPixel
          }
        }
      }

      // compute and set value for pixel
      surface[pixelIdx] = computePixelValue(which, travelTimes)

      // compute access values
      for (let i = 0; i < travelTimes.length; i++) {
        if (travelTimes[i] < cutoff) access[y * query.width + x]++
      }
    }
  }

  return {
    surface,
    access,
    cutoff,
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
    case 'AVERAGE':
      return computeAveragePixelValue(travelTimes)
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

export function computeAveragePixelValue (travelTimes) {
  let sum = 0
  let count = 0

  for (let i = 0; i < travelTimes.length; i++) {
    if (travelTimes[i] !== 255) {
      sum += travelTimes[i]
      count++
    }
  }

  // coerce to int
  if (count > travelTimes.length / 2) return (sum / count) | 0
  else return 255
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
