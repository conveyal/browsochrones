import {getContour} from 'jsolines'
import {createHandler} from 'web-worker-promise-interface'

import accessibilityForGrid from './accessibility-for-grid'
import generateDestinationData from './generate-destination-data'
import getIsochrone from './get-isochrone'
import getPathsAndTimes from './get-paths-and-times'
import getSurface from './get-surface'
import {getPath} from './get-transitive-data'
import isochroneTile from './isochrone-tile'
import {create as createGrid} from './grid'
import {create as createOrigin} from './origin'
import {create as createStopTreeCache} from './stop-tree-cache'

module.exports = createHandler({
  putGrid (ctx, message) {
    if (!ctx.grids) ctx.grids = new Map()
    const grid = createGrid(message.grid)
    ctx.grids.set(message.id, grid)
    const {contains, data, ...gridInfo} = grid
    return gridInfo
  },
  accessibilityForGrid (ctx, message) {
    return accessibilityForGrid({
      grid: ctx.grids.get(message.gridId),
      cutoff: message.cutoff,
      query: ctx.query,
      surface: ctx.surface.surface
    })
  },
  drawTile (ctx, message) {
    return isochroneTile(message.imageData, {
      height: ctx.query.height,
      scaleFactor: message.scaleFactor,
      surface: ctx.surface,
      width: ctx.query.width,
      xoffset: message.xoffset,
      yoffset: message.yoffset
    })
  },
  setOrigin (ctx, message, log) {
    ctx.origin = createOrigin({
      data: new Int32Array(message.data),
      log,
      point: message.point
    })
    const {data, index, ...originInfo} = ctx.origin
    return originInfo
  },
  setQuery (ctx, message) {
    ctx.query = message.query
  },
  setStopTreeCache (ctx, message) {
    ctx.stopTreeCache = createStopTreeCache({
      data: new Int32Array(message.data),
      size: ctx.query.width * ctx.query.height
    })
  },
  setTransitiveNetwork (ctx, message) {
    ctx.transitiveNetwork = message.network
  },
  generateSurface (ctx, message) {
    const {spectrogramData, ...surface} = getSurface({
      grid: ctx.grids.get(message.gridId),
      origin: ctx.origin,
      query: ctx.query,
      stopTreeCache: ctx.stopTreeCache,
      which: message.which
    })

    ctx = {...ctx, ...surface}
    return {spectrogramData}
  },
  generateDestinationData (ctx, message, log) {
    return generateDestinationData({
      ...ctx, // origin, query, stopTreeCache, surface, transitiveNetwork
      ...message, // from, to
      log
    })
  },
  getContour (ctx, message) {
    ctx.contour = getContour({
      cutoff: message.cutoff,
      height: ctx.query.height,
      surface: ctx.surface,
      width: ctx.query.width
    })
    return ctx.contour
  },
  getIsochrone (ctx, message) {
    return getIsochrone({
      ...ctx.query, // north, west, height, width
      ...message, // cutoff, interpolation
      surface: ctx.surface
    })
  },
  getPath (ctx, message) {
    return getPath({
      pathDescriptor: message.path,
      origin: ctx.origin
    })
  },
  getPaths (ctx, message) {
    return getPathsAndTimes({
      origin: ctx.origin,
      query: ctx.query,
      stopTreeCache: ctx.stopTreeCache,
      to: message.point
    })
  }
})
