import accessibilityForCutoff from './accessibility-for-cutoff'
import isochroneTile from './isochrone-tile'
import getSurface from './get-surface'
import StopTreeCache from './stop-tree-cache'
import Origin from './origin'
import getTransitiveData from './get-transitive-data'
import jsolines from 'jsolines'

const imageHeight = 256
const imageWidth = 256

export default class Browsochrones {
  constructor (opts) {
    const {origin, query, stopTrees, transitiveNetwork} = opts || {}
    if (origin) this.setOrigin(origin.data, origin.coordinates)
    if (query) this.setQuery(query)
    if (stopTrees) this.setStopTrees(stopTrees)
    if (transitiveNetwork) this.setTransitiveNetwork(transitiveNetwork)

    this.grids = new Map()
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
      grids: this.grids,
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
  putGrid (name, data) {
    // skip header, make another view of the array
    const array = new Int32Array(data, 4 * 5)
    const header = new Int32Array(data)

    for (let i = 0, prev = 0; i < array.length; i++) {
      array[i] = (prev += array[i])
    }

    const grid = {
      // parse header
      zoom: header[0],
      west: header[1],
      north: header[2],
      width: header[3],
      height: header[4],
      data: array
    }

    // all grids must have same extents because we only calculate the alignment of different grids once
    // when generating a surface
    if (this.exemplarGrid && (
        this.exemplarGrid.zoom !== grid.zoom ||
        this.exemplarGrid.west !== grid.west ||
        this.exemplarGrid.north !== grid.north ||
        this.exemplarGrid.width !== grid.width ||
        this.exemplarGrid.height !== grid.height
      )) {
      throw new Error('Grid parameters do not match existing grids')
    }

    if (!this.exemplarGrid) this.exemplarGrid = grid

    this.grids.set(name, grid)
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
    // do not include grids here, as any number of grids (including 0) is fine
    return this.query && this.stopTrees
  }

  isLoaded () {
    return this.isReady() && this.origin
  }

  /** Get a GeoJSON isochrone with the given cutoff (in minutes) */
  getIsochrone (minutes) {
    return jsolines({
      surface: this.surface.surface,
      width: this.query.width,
      height: this.query.height,
      cutoff: minutes,
      // coords are at zoom level of query
      project: ([x, y]) => {
        let ll = window.L.Map.prototype.unproject([x + this.query.west, y + this.query.north], this.query.zoom)
        return [ll.lng, ll.lat]
      }
    })
  }
}
