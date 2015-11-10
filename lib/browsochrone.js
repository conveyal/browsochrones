
import accessibilityForCutoff from './accessibility-for-cutoff'
import isochroneTile from './isochrone-tile'
import getSurface from './get-surface'

const imageHeight = 256
const imageWidth = 256

export default class Browsochrone {
  drawTile (canvas, {x, y}, zoom) {
    const scaleFactor = Math.pow(2, zoom - this.query.zoom)

    // find top-left coords at zoom 10
    // NB hipsters would use bitshifts but bitwise operators in Javascript only work on 32-bit ints. Javascript does not have 64-bit integer types.
    const xoffset = Math.round(x * imageWidth / scaleFactor - this.query.west)
    const yoffset = Math.round(y * imageHeight / scaleFactor - this.query.north)
    // NB x and y offsets are now relative to query

    const ctx = canvas.getContext('2d')
    const imageData = ctx.createImageData(imageHeight, imageWidth)

    isochroneTile(imageData, {
      cutoffMinutes: 60,
      height: this.query.height,
      imageHeight,
      imageWidth,
      scaleFactor,
      surface: this.surface.surface,
      width: this.query.width,
      x,
      xoffset,
      y,
      yoffset
    })

    ctx.putImageData(imageData, 0, 0)
  }

  getAccessibilityForCutoff (cutoff = 60) {
    return accessibilityForCutoff({
      cutoff,
      surface: this.surface,
      which: this.which || 'AVERAGE'
    })
  }

  generateSurface ({grid, origin, query, stopTrees, which} = {}) {
    this.surface = getSurface({
      grid: grid || this.grid,
      origin: origin || this.origin,
      query: query || this.query,
      stopTreeCache: stopTrees || this.stopTrees,
      which: which || this.which || 'AVERAGE'
    })
    return this.surface
  }

  setGrid (arrayBuffer) {
    const arr = new Float64Array(arrayBuffer, 24)

    for (let i = 0, prev = 0; i < arr.length; i++) {
      arr[i] = (prev += arr[i])
    }

    const dv = new DataView(arrayBuffer)
    this.grid = {
      // parse header
      zoom: dv.getInt32(0, true),
      west: dv.getInt32(4, true),
      north: dv.getInt32(8, true),
      width: dv.getInt32(12, true),
      height: dv.getInt32(16, true),
      data: arr
    }
  }

  setOrigin (arrayBuffer) {
    this.origin = new Int32Array(arrayBuffer)
  }

  setQuery (json) {
    this.query = json
  }

  setStopTrees (arrayBuffer) {
    this.stopTrees = new Int32Array(arrayBuffer)
  }
}
