import WebWorkerPromiseInterface from 'web-worker-promise-interface'

import workerHandlers from './worker-handlers'

const imageHeight = 256
const imageWidth = 256

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

  drawTile (canvas, {x, y}, zoom) {
    const scaleFactor = Math.pow(2, zoom - this.query.zoom)

    // find top-left coords at zoom 10
    // NB hipsters would use bitshifts but bitwise operators in Javascript only work on 32-bit ints. Javascript does not have 64-bit integer types.
    const xoffset = Math.round(x * imageWidth / scaleFactor - this.query.west)
    const yoffset = Math.round(y * imageHeight / scaleFactor - this.query.north)
    // NB x and y offsets are now relative to query

    const ctx = canvas.getContext('2d')
    const imageData = ctx.createImageData(imageHeight, imageWidth)

    this.work({
      command: 'drawTile',
      message: {
        imageData,
        scaleFactor,
        xoffset,
        yoffset
      }
    }).then(message => {
      ctx.putImageData(message, 0, 0)
    })
  }

  getAccessibilityForGrid (grid) {
    if (!this.isLoaded()) {
      return Promise.reject(new Error('Accessibility cannot be computed before generating a surface.'))
    }

    return this.work({
      command: 'accessibilityForGrid',
      message: {
        grid
      },
      transferrable: [grid]
    })
  }

  generateDestinationData (point) {
    return this.work({
      command: 'generateDestinationData',
      message: {
        point
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

  generateTransitiveData (point) {
    if (!this.isLoaded()) {
      return Promise.reject(new Error('Transitive data cannot be generated if Browsochrones is not fully loaded.'))
    }

    return this.work({
      command: 'generateTransitiveData',
      message: {
        point
      }
    })
  }

  generateSurface (cutoff = 60, which = 'AVERAGE') {
    if (!this.isLoaded()) {
      return Promise.reject(new Error('Surface cannot be generated if Browsochrones is not fully loaded.'))
    }

    return this.work({
      command: 'generateSurface',
      message: {
        cutoff,
        which
      }
    }).then(message => {
      this.surfaceLoaded = true
    })
  }

  /**
   * @param {Number} pixel.x
   * @param {Number} pixel.y
   * @param {Number} currentZoom
   * @returns {Object} point
   */
  pixelToOriginPoint ({x, y}, currentZoom) {
    if (!this.query) {
      throw new Error('Cannot convert point without query.')
    }

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
  setStopTrees (arrayBuffer) {
    if (!this.query) {
      return Promise.reject(new Error('Query must be loaded before generating the stop tree cache.'))
    }

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
  getIsochrone (cutoff = 60) {
    return this.work({
      command: 'getIsochrone',
      message: {
        cutoff
      }
    })
  }
}
