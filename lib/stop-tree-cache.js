/**
 * Cache trees from pixels to transit stops, including an index for where a particular pixel is located.
 * @author mattwigway
 */

/**
 * Construct a stop tree cache from a typed array
 *
 * @param {ArrayBuffer} data
 * @param {Number} size
 */
export function create (data, size) {
  const stopTreeCache = {}

  stopTreeCache.data = data
  stopTreeCache.index = new Int32Array(size)

  // function that reads from array performing bounds checks
  const read = (idx) => {
    if (idx >= data.length) {
      throw new Error('attempted to read past end of stop tree cache!')
    } else {
      return data[idx]
    }
  }

  // build the index and de-delta-code
  let pixelsRead = 0
  for (let i = 0, pixel = 0, stopId = 0, time = 0; i < data.length; pixel++) {
    stopTreeCache.index[pixel] = i
    const nStops = read(i++)

    for (let stopIdx = 0; stopIdx < nStops; stopIdx++) {
      stopId += read(i)
      data[i++] = stopId
      time += read(i)
      data[i++] = time
    }

    pixelsRead++
  }

  if (pixelsRead !== size) {
    throw new Error(`Expected to read ${size} pixels but read only ${pixelsRead}`)
  }

  return stopTreeCache
}
