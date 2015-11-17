/**
 * Cache trees from pixels to transit stops, including an index for where a particular pixel is located.
 * @author mattwigway
 */

export default class StopTreeCache {
  /** construct a stop tree cache from a typed array */
  constructor (array, query) {
    this.data = array
    this.index = new Int32Array(query.width * query.height)
    this.query = query

    // build the index and de-delta-code
    for (let i = 0, pixel = 0, stopId = 0, time = 0; i < array.length; pixel++) {
      this.index[pixel] = i
      let nStops = array[i++]
      for (let stopIdx = 0; stopIdx < nStops; stopIdx++) {
        stopId += array[i]
        array[i++] = stopId
        time += array[i]
        array[i++] = time
      }
    }
  }
}
