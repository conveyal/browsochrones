/**
 * Represents the data for a single origin, including a per-transit-stop index.
 * @author mattwigway
 */

/**
 * @param {ArrayBuffer} data
 * @param {Object} point
 * @param {Number} point.x
 * @param {Number} point.y
 */

export function create (data, point) {
  const origin = {}

  origin.data = data

  origin.x = point.x
  origin.y = point.y

  // de-delta-code non transit timess
  let offset = 0
  origin.radius = data[offset++]
  let nPixels = Math.pow(origin.radius * 2 + 1, 2)

  for (let pixel = 0, nonTransitTime = 0; pixel < nPixels; pixel++) {
    nonTransitTime += data[offset] // don't increment offset here, will be incremented on write
    data[offset++] = nonTransitTime // increment offset here
  }

  // build index
  let nStops = data[offset++]
  let nMinutes = data[offset++]
  origin.nStops = nStops
  origin.nMinutes = nMinutes

  origin.index = new Int32Array(nStops)

  for (let stop = 0; stop < nStops; stop++) {
    origin.index[stop] = offset

    // de delta code times and paths
    for (let min = 0, tvlTime = 0, path = 0; min < nMinutes; min++) {
      tvlTime += origin.data[offset + min * 2]
      // don't divide -1 (unreachable) by 60 as that will yield 0 (reachable very quickly)
      origin.data[offset + min * 2] = tvlTime === -1 ? -1 : tvlTime / 60 | 0

      path += origin.data[offset + min * 2 + 1]
      origin.data[offset + min * 2 + 1] = path
    }

    // skip the times
    offset += nMinutes * 2

    // read paths
    let nPaths = data[offset++]

    for (let path = 0; path < nPaths; path++) {
      let pathLen = data[offset++]
      offset += pathLen * 3 // 3 ints for each segment: board, pattern, and alight
    }
  }

  return origin
}

  /** get a non transit time in minutes, or 255 if you cannot walk to this pixel */
export function getNonTransitTime (origin, {x, y}) {
  let relx = x - origin.x
  let rely = y - origin.y

  if (Math.abs(relx) <= origin.radius && Math.abs(rely) <= origin.radius) {
    // make them nonnegative so they can be used as offsets
    relx += origin.radius
    rely += origin.radius

    // we can possibly walk to this pixel
    // the index of the pixel, plus one because the radius is recorded at the start of the array
    let timeSecs = origin.data[rely * (origin.radius * 2 + 1) + relx + 1]
    let timeMins = timeSecs / 60 | 0
    if (timeSecs !== -1 && timeMins < 255) return timeMins
  }

  return 255
}
