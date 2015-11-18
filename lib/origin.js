/**
 * represents the data for a single origin, including a per-transit-stop index.
 * @author mattwigway
 */
export default class Origin {
  constructor (array, x, y) {
    this.data = array

    this.x = x
    this.y = y

    // de-delta-code non transit timess
    let offset = 0
    this.radius = array[offset++]
    let nPixels = Math.pow(this.radius * 2 + 1, 2)

    for (let pixel = 0, nonTransitTime = 0; pixel < nPixels; pixel++) {
      nonTransitTime += array[offset] // don't increment offset here, will be incremented on write
      array[offset++] = nonTransitTime // increment offset here
    }

    // build index
    let nStops = array[offset++]
    let nMinutes = array[offset++]
    this.nStops = nStops
    this.nMinutes = nMinutes

    this.index = new Int32Array(nStops)

    for (let stop = 0; stop < nStops; stop++) {
      this.index[stop] = offset

      // skip the times
      offset += nMinutes * 2

      // read paths
      let nPaths = array[offset++]

      for (let path = 0; path < nPaths; path++) {
        let pathLen = array[offset++]
        offset += pathLen * 3 // 3 ints for each segment: board, pattern, and alight
      }
    }
  }

  /** get a non transit time in minutes, or 255 if you cannot walk to this pixel */
  getNonTransitTime (x, y) {
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
