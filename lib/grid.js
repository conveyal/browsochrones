/**
 * A grid file.
 */

export function create (data) {
  const array = new Int32Array(data, 4 * 5)
  const header = new Int32Array(data)

  for (let i = 0, prev = 0; i < array.length; i++) {
    array[i] = (prev += array[i])
  }
    // parse header
  return {
    zoom: header[0],
    west: header[1],
    north: header[2],
    width: header[3],
    height: header[4],
    data: array
  }
}
