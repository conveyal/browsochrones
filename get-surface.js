/**
 * Get a travel time surface and accessibility results for a particular origin.
 * Pass in references to the query (the JS object stored in query.json), the stopTreeCache, the origin file, the
 * x and y coordinates of the origin relative to the query, what parameter you want (BEST_CASE, WORST_CASE or AVERAGE),
 * and a grid. Returns a travel time/accessibility surface which can be used by isochoroneTile and accessibilityForCutoff
 */
export default function getSurface (query, stopTreeCache, origin, originX, originY, which, grid) {
  let ret = new Uint8Array(query.width * query.height)

  // where is the transit portion of the origin data
  // there are a certain number of pixels in each direction aroudn the origin with times in them. read the radius, multiply by two to get diameter,
  // add one because there is a pixel in the center, square to get number of pixels, add one to skip the first value which gives radius, and or with to
  // convert to 32-bit int
  let transitOffset = (Math.pow(origin[0] * 2 + 1, 2) + 1) | 0

  // how many departure minutes are there
  // skip number of stops
  let nMinutes = origin[transitOffset + 1]

  let travelTimes = new Uint8Array(nMinutes)
  // store the accessibility at each departure minute for every possible cutoff 1 - 120
  let accessPerMinute = new Float64Array(nMinutes * 120)

  // x and y refer to pixel coordinates not origins here
  // loop over rows first
  let stopId = 0
  let time = 0
  for (let y = 0, pixelIdx = 0, stcOffset = 0; y < query.height; y++) {
    for (let x = 0; x < query.width; x++, pixelIdx++) {
      let nStops = stopTreeCache[stcOffset++]

      // fill with unreachable
      travelTimes.fill(255)

      for (let stopIdx = 0; stopIdx < nStops; stopIdx++) {
        // read the stop ID (delta-coded)
        stopId += stopTreeCache[stcOffset++]

        // read the time (minutes)
        // delta-coded
        time += stopTreeCache[stcOffset++]

        // console.log(`stop ${stopId} at distance ${distance} (${nStops} stops to consider)`)

        // de-delta-code times
        let previous = 0
        for (let minute = 0; minute < nMinutes; minute++) {
          let offset = transitOffset + 2 + stopId * nMinutes + minute
          let travelTimeToStop = origin[offset] + previous
          previous = travelTimeToStop

          if (travelTimeToStop === -1) continue

          let travelTimeToPixel = (travelTimeToStop / 60 + time) | 0

          if (travelTimeToPixel > 254) continue

          if (travelTimes[minute] > travelTimeToPixel) travelTimes[minute] = travelTimeToPixel
        }
      }

      // compute value for pixel
      let pixel
      if (which === 'BEST_CASE') {
        pixel = 255
        for (let i = 0; i < nMinutes; i++) {
          pixel = Math.min(pixel, travelTimes[i])
        }
      } else if (which === 'AVERAGE') {
        let sum = 0
        let count = 0

        for (let i = 0; i < nMinutes; i++) {
          if (travelTimes[i] !== 255) {
            sum += travelTimes[i]
            count++
          }
        }

        // coerce to int
        if (count > nMinutes / 2) pixel = (sum / count) | 0
        else pixel = 255
      } else if (which === 'WORST_CASE') {
        pixel = 0
        for (let i = 0; i < nMinutes; i++) {
          pixel = Math.max(pixel, travelTimes[i])
        }
      }

      // set pixel value
      ret[pixelIdx] = pixel

      // compute access value
      // get value of this pixel from grid
      let gridx = x + query.west - grid.west
      let gridy = y + query.north - grid.north

      // if condition below fails we're off the grid, value is zero, don't bother with calculations
      if (gridx >= 0 && gridx < grid.width && gridy >= 0 && gridy < grid.height) {
        let val = grid.data[gridy * grid.width + gridx]

        for (let minute = 0; minute < nMinutes; minute++) {
          let travelTime = travelTimes[minute]

          if (travelTime === 255) continue

          // put this in all of the correct cutoff categories for this minute
          for (let cutoff = 119; cutoff >= travelTime - 1; cutoff--) {
            // TODO roll off smoothly
            accessPerMinute[cutoff * nMinutes + minute] += val
          }
        }
      }
    }
  }

  return {
    surface: ret,
    access: accessPerMinute,
    nMinutes: nMinutes
  }
}
