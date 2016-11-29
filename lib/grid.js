/**
 * A grid file.
 */

export function create (data) {
  const array = new Int32Array(data, 4 * 5)
  const header = new Int32Array(data)

  let min = Infinity
  let max = -Infinity

  for (let i = 0, prev = 0; i < array.length; i++) {
    array[i] = (prev += array[i])
    if (prev < min) min = prev
    if (prev > max) max = prev
  }

  const width = header[3]
  const height = header[4]

  // parse header
  return {
    zoom: header[0],
    west: header[1],
    north: header[2],
    width,
    height,
    data: array,
    min,
    max,
    contains (x, y) {
      return x >= 0 && x < width && y >= 0 && y < height
    }
  }
}
