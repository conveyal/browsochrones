import uuid from 'uuid'
import workify from 'webworkify'

import worker from './worker'

const imageHeight = 256
const imageWidth = 256

export default class Browsochrones {
  _errorHandlers = []
  _messageHandlers = []
  originLoaded = false
  query = false
  stopTreesLoaded = false
  surfaceLoaded = false

  constructor (opts) {
    const {origin, query, stopTrees, transitiveNetwork} = opts || {}

    this._worker = workify(worker)
    this._worker.addEventListener('message', event => this._handleMessage(event))
    this._worker.addEventListener('error', event => this._handleError(event))

    if (origin) this.setOrigin(origin.data, origin.coordinates)
    if (query) this.setQuery(query)
    if (stopTrees) this.setStopTrees(stopTrees)
    if (transitiveNetwork) this.setTransitiveNetwork(transitiveNetwork)

    this.drawTile = this.drawTile.bind(this)
  }

  _handleMessage (event) {
    this._messageHandlers.forEach(handler => handler.fn(event.data))
  }

  _handleError (event) {
    this._errorHandlers.forEach(handler => handler.fn(event))
  }

  _postMessage ({command, message, onSuccess, onError, transferrable}) {
    return new Promise((resolve, reject) => {
      const id = uuid.v4()

      this._messageHandlers.push({
        fn: event => {
          if (event.id === id) {
            if (onSuccess) onSuccess(event.message)
            this._clearHandlersFor(id)
            resolve(event.message)
          }
        },
        id
      })

      this._errorHandlers.push({
        fn: error => {
          if (error.id === id) {
            if (onError) onError(error)
            this._clearHandlersFor(id)
            reject(error)
          }
        },
        id
      })

      this._worker.postMessage({command, id, message}, transferrable)
    })
  }

  _clearHandlersFor (id) {
    this._messageHandlers = this._messageHandlers.filter(h => h.id !== id)
    this._errorHandlers = this._errorHandlers.filter(h => h.id !== id)
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

    this._postMessage({
      command: 'drawTile',
      message: {
        imageData,
        scaleFactor,
        xoffset,
        yoffset
      },
      onSuccess: message => {
        ctx.putImageData(message, 0, 0)
      }
    })
  }

  getAccessibilityForGrid (grid) {
    if (!this.isLoaded()) {
      return Promise.reject(new Error('Accessibility cannot be computed before generating a surface.'))
    }

    return this._postMessage({
      command: 'accessibilityForGrid',
      message: {
        grid
      },
      transferrable: [grid]
    })
  }

  getPaths (coordinates) {
    return this._postMessage({
      command: 'getPaths',
      message: {
        coordinates
      }
    })
  }

  getPath (path) {
    return this._postMessage({
      command: 'getPath',
      message: {
        path
      }
    })
  }

  generateTransitiveData (coordinates) {
    if (!this.isLoaded()) {
      return Promise.reject(new Error('Transitive data cannot be generated if Browsochrones is not fully loaded.'))
    }

    return this._postMessage({
      command: 'generateTransitiveData',
      message: {
        coordinates
      },
      onSuccess: message => {
        this.transitiveData = message
      }
    })
  }

  generateSurface (cutoff = 60, which = 'AVERAGE') {
    if (!this.isLoaded()) {
      return Promise.reject(new Error('Surface cannot be generated if Browsochrones is not fully loaded.'))
    }

    return this._postMessage({
      command: 'generateSurface',
      message: {
        cutoff,
        which
      },
      onSuccess: () => {
        this.surfaceLoaded = true
      }
    })
  }

  /**
   * @param {Number} pixel.x
   * @param {Number} pixel.y
   * @param {Number} currentZoom
   * @returns {Object} coordinates
   */
  pixelToOriginCoordinates ({x, y}, currentZoom) {
    if (!this.query) {
      throw new Error('Cannot convert coordinates without query.')
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
   * @param {Object} coordinates
   * @param {Number} coordinates.x
   * @param {Number} coordinates.y
   */
  setOrigin (arrayBuffer, coordinates) {
    return this._postMessage({
      command: 'setOrigin',
      message: {
        arrayBuffer,
        coordinates
      },
      onSuccess: () => {
        this.originLoaded = true
      },
      transferrable: [arrayBuffer]
    })
  }

  setQuery (json) {
    this._postMessage({
      command: 'setQuery',
      message: {
        query: json
      }
    })
    this.query = json
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

    return this._postMessage({
      command: 'setStopTreeCache',
      message: {
        arrayBuffer
      },
      onSuccess: () => {
        this.stopTreesLoaded = true
      },
      transferrable: [arrayBuffer]
    })
  }

  setTransitiveNetwork (json) {
    this._postMessage({
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
    return this._postMessage({
      command: 'getContour',
      message: {
        cutoff
      }
    })
  }

  /** Get a GeoJSON isochrone with the given cutoff (in minutes) */
  getIsochrone (cutoff = 60) {
    return this._postMessage({
      command: 'getIsochrone',
      message: {
        cutoff
      }
    })
  }
}
