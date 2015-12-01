/**
 * Get a travel time surface and accessibility results for a particular origin.
 * Pass in references to the query (the JS object stored in query.json), the stopTreeCache, the origin file, the
 * x and y coordinates of the origin relative to the query, what parameter you want (BEST_CASE, WORST_CASE or AVERAGE),
 * and a grid. Returns a travel time/accessibility surface which can be used by isochoroneTile and accessibilityForCutoff
 */
export default function getSurface ({grid, origin, query, stopTreeCache, which}) {
  let surface = new Uint8Array(query.width * query.height)

  let transitOffset = getTransitOffset(origin.data[0])

  // how many departure minutes are there. skip number of stops
  let nMinutes = origin.data[transitOffset + 1]

  let travelTimes = new Uint8Array(nMinutes)

  // store the accessibility at each departure minute for every possible cutoff 1 - 120
  let access = new Float64Array(nMinutes * 120)

  // x and y refer to pixel coordinates not origins here
  // loop over rows first
  for (let y = 0, pixelIdx = 0, stcOffset = 0; y < query.height; y++) {
    for (let x = 0; x < query.width; x++, pixelIdx++) {
      let nStops = stopTreeCache.data[stcOffset++]

      // can we reach this pixel without riding transit?
      let nonTransitTime = origin.getNonTransitTime({x, y})

      // fill with unreachable, or the walk distance
      travelTimes.fill(nonTransitTime)

      for (let stopIdx = 0; stopIdx < nStops; stopIdx++) {
        // read the stop ID
        let stopId = stopTreeCache.data[stcOffset++]

        // read the time (minutes)
        let time = stopTreeCache.data[stcOffset++]

        // de-delta-code times
        for (let minute = 0; minute < nMinutes; minute++) {
          let offset = origin.index[stopId] + minute * 2 // * 2 because path info is included as well
          let travelTimeToStop = origin.data[offset]

          if (travelTimeToStop === -1) continue

          let travelTimeToPixel = (travelTimeToStop + time) | 0

          if (travelTimeToPixel > 254) continue

          if (travelTimes[minute] > travelTimeToPixel) travelTimes[minute] = travelTimeToPixel
        }
      }

      // compute and set value for pixel
      surface[pixelIdx] = computePixelValue(which, travelTimes)

      // compute access values
      computeAccessValues(x, y, query, grid, travelTimes, access)
    }
  }

  return {
    surface,
    access,
    nMinutes
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

/**
 * Compute access values for x, y
 *
 * @param {Number} x
 * @param {Number} y
 * @param {Object} query
 * @param {Object} grid
 * @param {Uint8Array} travelTimes
 * @param {Float64Array} accessPerMinute
 */

export function computeAccessValues (x, y, query, grid, travelTimes, access) {
  // get value of this pixel from grid
  let gridx = x + query.west - grid.west
  let gridy = y + query.north - grid.north

  // if condition below fails we're off the grid, value is zero, don't bother with calculations
  if (gridx >= 0 && gridx < grid.width && gridy >= 0 && gridy < grid.height) {
    let val = grid.data[gridy * grid.width + gridx]

    for (let minute = 0; minute < travelTimes.length; minute++) {
      let travelTime = travelTimes[minute]

      if (travelTime !== 255) {
        // put this in all of the correct cutoff categories for this minute
        for (let cutoff = 119; cutoff >= travelTime; cutoff--) {
          access[cutoff * travelTimes.length + minute] += val
        }
      }
    }
  }
}
