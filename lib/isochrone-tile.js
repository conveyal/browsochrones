
/**
 * Draw a tile onto the canvas. First three options are same as those used in leaflet TileLayer
 */

export default function isochroneTile (canvas, tilePoint, zoom, query, surface, cutoffMinutes) {
  // find top-left coords at zoom 10
  let xoff = tilePoint.x * 256
  let yoff = tilePoint.y * 256

  let scaleFactor = Math.pow(2, zoom - query.zoom)

  // NB hipsters would use bitshifts but bitwise operators in Javascript only work on 32-bit ints. Javascript does not
  // have 64-bit integer types.
  xoff = Math.round(xoff / scaleFactor)
  yoff = Math.round(yoff / scaleFactor)

  xoff -= query.west
  yoff -= query.north

  // NB x and y offsets are now relative to query

  let ctx = canvas.getContext('2d')
  let data = ctx.createImageData(256, 256)

  // compiler should avoid overflow checks for xp and yp because of the < 256 condition, but prevent it from checking for
  // pixel overflow with | 0
  for (let yp = 0, pixel = 0; yp < 256; yp++) {
    for (let xp = 0; xp < 256; xp++, pixel = (pixel + 1) | 0) {
      // figure out where xp and yp fall on the surface
      let xpsurf = (xp / scaleFactor + xoff) | 0
      let ypsurf = (yp / scaleFactor + yoff) | 0

      let val
      if (xpsurf < 0 || xpsurf > query.width || ypsurf < 0 || ypsurf > query.height) {
        val = 255
      } else {
        val = surface.surface[ypsurf * query.width + xpsurf]
      }

      if (val <= cutoffMinutes) {
        // 50% transparent yellow (#ddddaa)
        data.data[pixel * 4] = 0xdd
        data.data[pixel * 4 + 1] = 0xdd
        data.data[pixel * 4 + 2] = 0xaa
        data.data[pixel * 4 + 3] = 220
      } else {
        // fully transparent
        data.data[pixel * 4 + 3] = 0
      }
    }
  }

  ctx.putImageData(data, 0, 0)
}
