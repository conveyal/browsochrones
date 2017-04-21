import dbg from 'debug'
import propagate from './propagation'
const debug = dbg('browsochrones:get-surface')

const MAX_TRIP_LENGTH = 120 // minutes

/**
 * Get a travel time surface and accessibility results for a particular origin.
 * Pass in references to the query (the JS object stored in query.json), the stopTreeCache, the origin file, the
 * x and y origin point relative to the query, what parameter you want (BEST_CASE, WORST_CASE or MEDIAN),
 * and a cutoff for accessibility calculations. Sets the current surface within the Browsochrones instance,
 * and returns data used to draw a spectrogram.
 * This is basically just an array of curves like so:
 * For each iteration you will have an array of
 *  [opportunities reachable in 1 minute,
 *   marginal opportunities reachable in 2 minutes,
 *   ...
 *   marginal opportunities reachable in 120 minutes]
 *
 * This does mean that changing the grid requires recomputing the surface even though that's not technically
 * required. It is assumed this is a relatively rare occurence and it's worth the extra work there to
 * avoid doing propagation twice, once for getting the surface and once for the spectrogram data.
 * It's also better than having duplicate code to avoid computing a surface sometimes. We could add a
 * switch to this function to select what is generated but that may even be more complexity than is needed.
 */
export default function getSurfaceAndSpectrogramData ({
  grid,
  origin,
  query,
  stopTreeCache,
  which
}) {
  debug('generating surface and spectrogram data')
  const surface = new Uint8Array(query.width * query.height)
  const waitTimes = new Uint8Array(query.width * query.height)
  const inVehicleTravelTimes = new Uint8Array(query.width * query.height)
  const walkTimes = new Uint8Array(query.width * query.height)

  const spectrogramData = []
  for (let i = 0; i < origin.nMinutes; i++) spectrogramData.push(new Uint32Array(MAX_TRIP_LENGTH))

  const transitOffset = getTransitOffset(origin.data[0])

  // how many departure minutes are there. skip number of stops
  const nMinutes = origin.data[transitOffset + 1]

  propagate({
    query,
    stopTreeCache,
    origin,
    callback ({
      travelTimesForDest,
      walkTimesForDest,
      inVehicleTravelTimesForDest,
      waitTimesForDest,
      x,
      y
    }) {
      // handle surface
      const pixelIdx = y * query.width + x
      // compute and set value for pixel
      surface[pixelIdx] = computePixelValue(which, travelTimesForDest)
      waitTimes[pixelIdx] = computePixelValue(which, waitTimesForDest)
      walkTimes[pixelIdx] = computePixelValue(which, walkTimesForDest)
      inVehicleTravelTimes[pixelIdx] = computePixelValue(which, inVehicleTravelTimesForDest)

      // handle spectrogram data
      const gridx = x + query.west - grid.west
      const gridy = y + query.north - grid.north

      if (grid.contains(gridx, gridy)) {
        const val = grid.data[gridy * grid.width + gridx]

        for (let i = 0; i < travelTimesForDest.length; i++) {
          const time = travelTimesForDest[i]
          if (time !== 255 && time < MAX_TRIP_LENGTH) {
            // time - 1 so areas reachable in 1 minute will be included in output[i][0]
            // TODO audit all the places we're flooring things
            spectrogramData[i][time - 1] += val
          }
        }
      }
    }
  })

  debug('generating surface complete')

  return {
    surface,
    waitTimes,
    walkTimes,
    inVehicleTravelTimes,
    query,
    spectrogramData,
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
