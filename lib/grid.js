/**
 * A grid file.
 */

export default class Grid {
  constructor (data) {
    const array = new Int32Array(data, 4 * 5)
    const header = new Int32Array(data)

    for (let i = 0, prev = 0; i < array.length; i++) {
      array[i] = (prev += array[i])
    }
      // parse header
    this.zoom = header[0]
    this.west = header[1]
    this.north = header[2]
    this.width = header[3]
    this.height = header[4]
    this.data = array
  }
}
