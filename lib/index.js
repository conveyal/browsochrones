import WebWorkerPromiseInterface from 'web-worker-promise-interface'

import {create as createGridFunc} from './grid'
import {latToPixel, lonToPixel} from './mercator'
import workerHandlers from './worker-handlers'

const imageHeight = 256
const imageWidth = 256

function assert (e, msg) {
  if (!e) throw new Error(msg)
}

export default class Browsochrones extends WebWorkerPromiseInterface {
  originLoaded = false
  query = false
  stopTreesLoaded = false
  surfaceLoaded = false

  constructor (opts) {
    super(workerHandlers)
    const {origin, query, stopTrees, transitiveNetwork} = opts || {}

    if (origin) this.setOrigin(origin.data, origin.point)
    if (query) this.setQuery(query)
    if (stopTrees) this.setStopTrees(stopTrees)
    if (transitiveNetwork) this.setTransitiveNetwork(transitiveNetwork)

    this.drawTile = this.drawTile.bind(this)
  }

  /**
   * transfer a grid (as a raw arraybuffer) into this instance's worker. Note that this will neuter the grid, make a copy
   * before calling this function if you expect to use it elsewhere
   */
  putGrid (key, grid) {
    return this.work({
      command: 'putGrid',
      message: { key, grid }
    })
  }

  createTile = (coords, done) => {
    const tile = document.createElement('canvas')
    tile.height = imageHeight
    tile.width = imageWidth
    this.drawTile(tile, coords, coords.z)
      .then(() => done(null, tile))
      .catch((err) => done(err, tile))
    return tile
  }

  drawTile = (canvas, {x, y}, zoom) => {
    const scaleFactor = Math.pow(2, zoom - this.query.zoom)

    // find top-left coords at zoom 10
    // NB hipsters would use bitshifts but bitwise operators in Javascript only work on 32-bit ints. Javascript does not have 64-bit integer types.
    const xoffset = Math.round(x * imageWidth / scaleFactor - this.query.west)
    const yoffset = Math.round(y * imageHeight / scaleFactor - this.query.north)
    // NB x and y offsets are now relative to query

    const ctx = canvas.getContext('2d')
    const imageData = ctx.createImageData(imageHeight, imageWidth)

    return this.work({
      command: 'drawTile',
      message: {
        imageData,
        scaleFactor,
        xoffset,
        yoffset
      }
    }).then((message) => {
      ctx.putImageData(message, 0, 0)
      return message
    })
  }

  async getAccessibilityForGrid (grid, cutoff = 60) {
    assert(this.isLoaded(), 'Accessibility cannot be computed before generating a surface.')

    return this.work({
      command: 'accessibilityForGrid',
      message: {
        grid, cutoff
      }
    })
  }

  async generateDestinationData ({ from, to }) {
    assert(this.isLoaded(), 'Transitive data cannot be generated if Browsochrones is not fully loaded.')

    return this.work({
      command: 'generateDestinationData',
      message: {
        from,
        to
      }
    })
  }

  getPaths (point) {
    return this.work({
      command: 'getPaths',
      message: {
        point
      }
    })
  }

  getPath (path) {
    return this.work({
      command: 'getPath',
      message: {
        path
      }
    })
  }

  async generateSurface (grid, which = 'MEDIAN') {
    assert(this.isLoaded(), 'Surface cannot be generated if Browsochrones is not fully loaded.')

    return this.work({
      command: 'generateSurface',
      message: {
        grid,
        which
      }
    }).then((message) => {
      this.surfaceLoaded = true
      return message
    })
  }

  latLonToOriginPoint ({lat, lon, lng}) {
    assert(this.query, 'Cannot convert lat/lon without query.')
    const {north, west, zoom} = this.query
    const x = lonToPixel(lon || lng, zoom)
    const y = latToPixel(lat, zoom)
    const ret = {
      // TODO should these be rounded instead of floored?
      x: (x - west) | 0,
      y: (y - north) | 0
    }
    assert(this.pointInQueryBounds(ret), 'Point out of query bounds!')
    return ret
  }

  /**
   * @param {Number} pixel.x
   * @param {Number} pixel.y
   * @param {Number} currentZoom
   * @returns {Object} point
   */
  pixelToOriginPoint ({x, y}, currentZoom) {
    assert(this.query, 'Cannot convert point without query.')

    const {north, west, zoom} = this.query
    const scale = Math.pow(2, zoom - currentZoom)

    x = x * scale - west | 0
    y = y * scale - north | 0

    return {x, y}
  }

  /**
   * @param {Number} point.x
   * @param {Number} point.y
   * @returns {Boolean}
   */
  pointInQueryBounds ({x, y}) {
    const {height, width} = this.query
    return x >= 0 && x <= width && y >= 0 && y <= height
  }

  /**
   * @param {ArrayBuffer} data
   * @param {Object} point
   * @param {Number} point.x
   * @param {Number} point.y
   */
  setOrigin (arrayBuffer, point) {
    return this.work({
      command: 'setOrigin',
      message: {
        arrayBuffer,
        point
      },
      transferrable: [arrayBuffer]
    }).then(() => {
      this.originLoaded = true
    })
  }

  setQuery (json) {
    this.query = json
    return this.work({
      command: 'setQuery',
      message: {
        query: json
      }
    })
  }

  /**
   * Generate the stop tree cache. Must set the query first.
   *
   * @param {ArrayBuffer} data
   */
  async setStopTrees (arrayBuffer) {
    assert(this.query, 'Query must be loaded before generating the stop tree cache.')

    return this.work({
      command: 'setStopTreeCache',
      message: {
        arrayBuffer
      },
      transferrable: [arrayBuffer]
    }).then(() => {
      this.stopTreesLoaded = true
    })
  }

  setTransitiveNetwork (json) {
    return this.work({
      command: 'setTransitiveNetwork',
      message: {
        network: json
      }
    })
  }

  isReady () {
    return this.query && this.stopTreesLoaded
  }

  isLoaded () {
    return this.isReady() && this.originLoaded
  }

  getContour (cutoff = 60) {
    return this.work({
      command: 'getContour',
      message: {
        cutoff
      }
    })
  }

  /** Get a GeoJSON isochrone with the given cutoff (in minutes) */
  getIsochrone (cutoff = 60, interpolation = true) {
    return this.work({
      command: 'getIsochrone',
      message: {
        cutoff,
        interpolation
      }
    })
  }
}

export const createGrid = createGridFunc
