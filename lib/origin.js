/**
 * represents the data for a single origin, including a per-transit-stop index.
 * @author mattwigway
 */
export default class Origin {
  constructor (array, x, y) {
    this.data = array

    this.x = x
    this.y = y

    // build index
    let offset = 0
    this.radius = array[offset++]
    offset += Math.pow(this.radius * 2 + 1, 2) // skip nontransit data
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
}
