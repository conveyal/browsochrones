/**
 * Represents the data for a single origin, including a per-transit-stop index.
 * @author mattwigway
 */
export default class Origin {

  /**
   * @param {ArrayBuffer} data
   * @param {Object} coordinates
   * @param {Number} coordinates.x
   * @param {Number} coordinates.y
   */
  constructor (data, coordinates) {
    this.data = data

    this.x = coordinates.x
    this.y = coordinates.y

    // de-delta-code non transit timess
    let offset = 0
    this.radius = data[offset++]
    let nPixels = Math.pow(this.radius * 2 + 1, 2)

    for (let pixel = 0, nonTransitTime = 0; pixel < nPixels; pixel++) {
      nonTransitTime += data[offset] // don't increment offset here, will be incremented on write
      data[offset++] = nonTransitTime // increment offset here
    }

    // build index
    let nStops = data[offset++]
    let nMinutes = data[offset++]
    this.nStops = nStops
    this.nMinutes = nMinutes

    this.index = new Int32Array(nStops)

    for (let stop = 0; stop < nStops; stop++) {
      this.index[stop] = offset

      // de delta code times and paths
      for (let min = 0, tvlTime = 0, path = 0; min < nMinutes; min++) {
        tvlTime += this.data[offset + min * 2]
        // don't divide -1 (unreachable) by 60 as that will yield 0 (reachable very quickly)
        this.data[offset + min * 2] = tvlTime === -1 ? -1 : tvlTime / 60 | 0

        path += this.data[offset + min * 2 + 1]
        this.data[offset + min * 2 + 1] = path
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
  }

  /** get a non transit time in minutes, or 255 if you cannot walk to this pixel */
  getNonTransitTime ({x, y}) {
    let relx = x - this.x
    let rely = y - this.y

    if (Math.abs(relx) <= this.radius && Math.abs(rely) <= this.radius) {
      // make them nonnegative so they can be used as offsets
      relx += this.radius
      rely += this.radius

      // we can possibly walk to this pixel
      // the index of the pixel, plus one because the radius is recorded at the start of the array
      let timeSecs = this.data[rely * (this.radius * 2 + 1) + relx + 1] / 60
      let timeMins = timeSecs / 60 | 0
      if (timeSecs !== -1 && timeMins < 255) return timeMins
    }

    return 255
  }
}
