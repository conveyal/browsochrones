// @flow
import {getContour} from 'jsolines'
import {createHandler} from 'web-worker-promise-interface'

import accessibilityForGrid from './accessibility-for-grid'
import generateDestinationData from './generate-destination-data'
import getIsochrone from './get-isochrone'
import getPathsAndTimes from './get-paths-and-times'
import {create as createSurface} from './surface'
import isochroneTile from './isochrone-tile'
import {create as createGrid} from './grid'
import {create as createOrigin, getStopPatternStopSets} from './origin'
import {create as createStopTreeCache} from './stop-tree-cache'
import {colorScheme} from './utils'

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
      ...ctx,
      grid: ctx.grids.get(message.gridId),
      cutoff: message.cutoff
    })
  },
  drawTile (ctx, message) {
    return isochroneTile(message.imageData, {
      colorScheme,
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
  generateSurface (ctx, message, log) {
    const {spectrogramData, ...data} = createSurface({
      ...ctx,
      grid: ctx.grids.get(message.gridId),
      log,
      which: message.which
    })
    ctx.surface = data.surface
    ctx.waitTimes = data.waitTimes
    ctx.walkTimes = data.walkTimes
    ctx.inVehicleTravelTimes = data.inVehicleTravelTimes

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
  getPath (ctx, message, log) {
    return getStopPatternStopSets({
      log,
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
