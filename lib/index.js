// @flow
import assert from 'assert'
import dbg from 'debug'
import WebWorkerPromiseInterface from 'web-worker-promise-interface'

import {create as createGridFunc} from './grid'
import {latToPixel, lonToPixel} from './mercator'

import type {
  Case,
  Coords,
  Feature,
  Grid,
  LatLon,
  PathDescriptor,
  Point,
  Query,
  TransitiveData
} from './types'

const imageHeight = 256
const imageWidth = 256

const debug = dbg('browsochrones')

export default class Browsochrones extends WebWorkerPromiseInterface {
  originLoaded: boolean = false
  queryLoaded: boolean = false
  stopTreesLoaded: boolean = false
  surfaceLoaded: boolean = false

  constructor ({webpack = false}: {webpack: boolean} = {}) {
    super(webpack ? require.resolve('./worker-handlers') : require('./worker-handlers'))
  }

  log (...args: any[]) {
    debug(...args)
  }

  /**
   * transfer a grid (as a raw arraybuffer) into this instance's worker. Note that this will neuter the grid, make a copy
   * before calling this function if you expect to use it elsewhere
   */
  putGrid ({id, grid}: {
    id: string,
    grid: ArrayBuffer
  }): Promise<Grid> {
    assert(typeof id === 'string', 'Id must be a string')
    assert(grid instanceof ArrayBuffer, 'Grid must be an ArrayBuffer')

    return this.work({
      command: 'putGrid',
      message: {id, grid}
    })
  }

  createTile = (
    coords: Coords,
    done: (Error | null, HTMLCanvasElement) => void
  ): HTMLCanvasElement => {
    const tile = document.createElement('canvas')
    tile.height = imageHeight
    tile.width = imageWidth
    this.drawTile(tile, coords, coords.z)
      .then(() => done(null, tile))
      .catch((err) => done(err, tile))
    return tile
  }

  drawTile = (
    canvas: HTMLCanvasElement,
    {x, y}: Coords,
    zoom: number
  ): Promise<ImageData> => {
    assert(this.queryLoaded, 'A query is required to draw a tile')
    const scaleFactor = Math.pow(2, zoom - this.query.zoom)

    // find top-left coords at zoom 10
    // NB hipsters would use bitshifts but bitwise operators in Javascript only
    // work on 32-bit ints. Javascript does not have 64-bit integer types.
    const xoffset = Math.round(x * imageWidth / scaleFactor - this.query.west)
    const yoffset = Math.round(y * imageHeight / scaleFactor - this.query.north)
    // NB x and y offsets are now relative to query

    const ctx = canvas.getContext('2d')
    if (!ctx) return Promise.reject(new Error('Failed to get context'))
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

  async getAccessibilityForGrid ({gridId, cutoff = 60}: {
    cutoff: number,
    gridId: string
  }): Promise<number> {
    assert(typeof gridId === 'string', 'A grid is required to get accessibility.')
    assert(this.isLoaded(), 'Accessibility cannot be computed before generating a surface.')

    return this.work({
      command: 'accessibilityForGrid',
      message: {
        gridId, cutoff
      }
    })
  }

  async generateDestinationData ({from, to}: {
    from: Point,
    to: Point
  }): Promise<{
    transitive: TransitiveData
  }> {
    assert(from && from.x && from.y, '`from` point is required to generate destination data.')
    assert(to && to.x && to.y, '`to` point is required to generate destination data.')
    assert(this.isLoaded(), 'Transitive data cannot be generated if Browsochrones is not fully loaded.')

    return this.work({
      command: 'generateDestinationData',
      message: {
        from,
        to
      }
    })
  }

  getPaths (point: Point) {
    return this.work({
      command: 'getPaths',
      message: {
        point
      }
    })
  }

  getPath (path: PathDescriptor) {
    return this.work({
      command: 'getPath',
      message: {
        path
      }
    })
  }

  async generateSurface ({gridId, which = 'MEDIAN'}: {
    gridId: string,
    which: Case
  }) {
    assert(gridId, 'A gridId is required to generate a surface.')
    assert(this.isLoaded(), 'Surface cannot be generated if Browsochrones is not fully loaded.')

    return this.work({
      command: 'generateSurface',
      message: {
        gridId,
        which
      }
    }).then((message) => {
      this.surfaceLoaded = true
      return message
    })
  }

  latLonToOriginPoint ({lat, lon}: LatLon) {
    assert(lat, 'A latitude is required to generate an origin point.')
    assert(lon, 'A longitude is required to generate an origin point.')
    assert(this.query, 'Cannot convert lat/lon without query.')

    const {north, west, zoom} = this.query
    const x = lonToPixel(lon, zoom)
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
   * @param {Point} pixel
   * @param {Number} currentZoom
   * @returns {Point} point
   */
  pixelToOriginPoint ({pixel, currentZoom}: {
    pixel: Point,
    currentZoom: number
  }) {
    assert(this.query, 'Cannot convert point without query.')

    let {x, y} = pixel
    const {north, west, zoom} = this.query
    const scale = Math.pow(2, zoom - currentZoom)

    x = x * scale - west | 0
    y = y * scale - north | 0

    return {x, y}
  }

  /**
   * @param {Point} point
   * @returns {Boolean}
   */
  pointInQueryBounds ({x, y}: Point) {
    const {height, width} = this.query
    return x >= 0 && x <= width && y >= 0 && y <= height
  }

  /**
   * @param {ArrayBuffer} data
   * @param {Point} point
   */
  setOrigin ({data, point}: {
    data: ArrayBuffer,
    point: Point
  }) {
    assert(data instanceof ArrayBuffer, 'Origin data must be an ArrayBuffer')
    assert(!isNaN(point.x) && !isNaN(point.y), 'Point must contain an x and y value')

    return this.work({
      command: 'setOrigin',
      message: {
        data,
        point
      },
      transferrable: [data]
    }).then((message) => {
      this.originLoaded = true
      return message
    })
  }

  setQuery (json: Query) {
    this.query = json
    return this.work({
      command: 'setQuery',
      message: {
        query: json
      }
    }).then((results) => {
      this.queryLoaded = true
      return results
    })
  }

  /**
   * Generate the stop tree cache. Must set the query first.
   *
   * @param {ArrayBuffer} data
   */
  async setStopTrees (data: ArrayBuffer) {
    assert(this.query, 'Query must be loaded before generating the stop tree cache.')

    return this.work({
      command: 'setStopTreeCache',
      message: {
        data
      },
      transferrable: [data]
    }).then(() => {
      this.stopTreesLoaded = true
    })
  }

  setTransitiveNetwork (json: TransitiveData) {
    return this.work({
      command: 'setTransitiveNetwork',
      message: {
        network: json
      }
    })
  }

  isReady (): boolean {
    return this.queryLoaded && this.stopTreesLoaded
  }

  isLoaded (): boolean {
    return this.isReady() && this.originLoaded
  }

  getContour (cutoff: number = 60) {
    return this.work({
      command: 'getContour',
      message: {
        cutoff
      }
    })
  }

  /** Get a GeoJSON isochrone with the given cutoff (in minutes) */
  getIsochrone ({cutoff = 60, interpolation = true}: {
    cutoff: number,
    interpolation: boolean
  }): Feature {
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
