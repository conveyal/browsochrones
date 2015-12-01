import accessibilityForCutoff from './accessibility-for-cutoff'
import isochroneTile from './isochrone-tile'
import getSurface from './get-surface'
import StopTreeCache from './stop-tree-cache'
import Origin from './origin'
import getTransitiveData from './get-transitive-data'

const imageHeight = 256
const imageWidth = 256

export default class Browsochrones {
  constructor (opts) {
    const {grid, origin, query, stopTrees, transitiveNetwork} = opts || {}
    if (grid) this.setGrid(grid)
    if (origin) this.setOrigin(origin.data, origin.coordinates)
    if (query) this.setQuery(query)
    if (stopTrees) this.setStopTrees(stopTrees)
    if (transitiveNetwork) this.setTransitiveNetwork(transitiveNetwork)
  }

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
    if (!this.surface) {
      throw new Error('Accessibility cannot be computed before generating a surface.')
    }

    this.accessibilityForCutoff = accessibilityForCutoff({
      cutoff,
      surface: this.surface,
      which: this.which || 'AVERAGE'
    })
    return this.accessibilityForCutoff
  }

  generateTransitiveData (coordinates) {
    if (!this.isLoaded()) {
      throw new Error('Transitive data cannot be generated if Browsochrones is not fully loaded.')
    }

    this.transitiveData = getTransitiveData({
      origin: this.origin,
      query: this.query,
      stopTreeCache: this.stopTrees,
      network: this.transitiveNetwork,
      to: coordinates
    })
    return this.transitiveData
  }

  generateSurface () {
    if (!this.isLoaded()) {
      throw new Error('Surface cannot be generated if Browsochrones is not fully loaded.')
    }

    this.surface = getSurface({
      grid: this.grid,
      origin: this.origin,
      query: this.query,
      stopTreeCache: this.stopTrees,
      which: this.which || 'AVERAGE'
    })
    return this.surface
  }

  /**
   * @param {Number} pixel.x
   * @param {Number} pixel.y
   * @param {Number} currentZoom
   * @returns {Object} coordinates
   */
  pixelToOriginCoordinates ({x, y}, currentZoom) {
    if (!this.query) {
      throw new Error('Cannot convert coordinates without query loaded.')
    }

    const {north, west, zoom} = this.query
    const scale = Math.pow(2, zoom - currentZoom)

    x = x * scale - west | 0
    y = y * scale - north | 0

    return {x, y}
  }

  /**
   * @param {Number} coordinates.x
   * @param {Number} coordinates.y
   * @returns {Boolean}
   */
  coordinatesInQueryBounds ({x, y}) {
    const {height, width} = this.query
    return x >= 0 && x <= width && y >= 0 && y <= height
  }

  /**
   * @param {ArrayBuffer} data
   */
  setGrid (data) {
    const arr = new Float64Array(data, 24)

    for (let i = 0, prev = 0; i < arr.length; i++) {
      arr[i] = (prev += arr[i])
    }

    const dv = new DataView(data)
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

  /**
   * @param {ArrayBuffer} data
   * @param {Object} coordinates
   * @param {Number} coordinates.x
   * @param {Number} coordinates.y
   */
  setOrigin (data, coordinates) {
    this.origin = new Origin(new Int32Array(data), coordinates)
  }

  setQuery (json) {
    this.query = json
  }

  /**
   * Generate the stop tree cache. Must set the query first.
   *
   * @param {ArrayBuffer} data
   */
  setStopTrees (data) {
    if (!this.query) {
      throw new Error('Query must be loaded before generating the stop tree cache.')
    }

    this.stopTrees = new StopTreeCache(new Int32Array(data), this.query.width * this.query.height)
  }

  setTransitiveNetwork (json) {
    this.transitiveNetwork = json
  }

  isReady () {
    return this.grid && this.query && this.stopTrees
  }

  isLoaded () {
    return this.isReady() && this.origin
  }
}
