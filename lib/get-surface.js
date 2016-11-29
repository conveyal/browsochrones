import dbg from 'debug'
import propagate from './propagation'
const debug = dbg('browsochrones:get-surface')

/**
 * Get a travel time surface and accessibility results for a particular origin.
 * Pass in references to the query (the JS object stored in query.json), the stopTreeCache, the origin file, the
 * x and y origin point relative to the query, what parameter you want (BEST_CASE, WORST_CASE or MEDIAN),
 * and a cutoff for accessibility calculations. Returns a travel time/accessibility surface which can be used by isochoroneTile and accessibilityForCutoff
 */
export default function getSurface ({origin, query, stopTreeCache, which}) {
  debug('generating surface')
  const surface = new Uint8Array(query.width * query.height)
  const waitTimes = new Uint8Array(query.width * query.height)
  const inVehicleTravelTimes = new Uint8Array(query.width * query.height)
  const walkTimes = new Uint8Array(query.width * query.height)

  const transitOffset = getTransitOffset(origin.data[0])

  // how many departure minutes are there. skip number of stops
  const nMinutes = origin.data[transitOffset + 1]

  propagate({
    query,
    stopTreeCache,
    origin,
    callback: ({
      travelTimesForDest,
      walkTimesForDest,
      inVehicleTravelTimesForDest,
      waitTimesForDest,
      x,
      y
    }) => {
      const pixelIdx = y * query.width + x
      // compute and set value for pixel
      surface[pixelIdx] = computePixelValue(which, travelTimesForDest)
      waitTimes[pixelIdx] = computePixelValue(which, waitTimesForDest)
      walkTimes[pixelIdx] = computePixelValue(which, walkTimesForDest)
      inVehicleTravelTimes[pixelIdx] = computePixelValue(which, inVehicleTravelTimesForDest)
    }
  })

  debug('generating surface complete')

  return {
    surface,
    waitTimes,
    walkTimes,
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
    const pos = travelTimes.length / 2
    // -1 because off-by-one
    return (travelTimes[pos] + travelTimes[pos - 1]) / 2
  }
}

export function computeAveragePixelValue (travelTimes) {
  let count = 0
  let sum = 0

  for (let i = 0; i < travelTimes.length; i++) {
    if (travelTimes[i] !== 255) {
      count++
      sum += travelTimes[i]
    }
  }

  // TODO reachability threshold?
  return count > 0 ? sum / count : 255
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
