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

    // build the index
    for (let i = 0, pixel = 0; i < array.length; i++, pixel++) {
      this.index[pixel] = i
      let nStops = array[i]
      // skip contents
      i += nStops * 2 // i will be incremented once more at the top of the loop to skip over stop count
    }
  }
}
