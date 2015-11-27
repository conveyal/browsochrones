/**
 * Cache trees from pixels to transit stops, including an index for where a particular pixel is located.
 * @author mattwigway
 */
export default class StopTreeCache {

  /**
   * Construct a stop tree cache from a typed array
   *
   * @param {ArrayBuffer} data
   * @param {Number} size
   */
  constructor (data, size) {
    this.data = data
    this.index = new Int32Array(size)

    // build the index and de-delta-code
    for (let i = 0, pixel = 0, stopId = 0, time = 0; i < data.length; pixel++) {
      this.index[pixel] = i
      let nStops = data[i++]
      for (let stopIdx = 0; stopIdx < nStops; stopIdx++) {
        stopId += data[i]
        data[i++] = stopId
        time += data[i]
        data[i++] = time
      }
    }
  }
}
