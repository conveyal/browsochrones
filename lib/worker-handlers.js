import jsolines from 'jsolines'
import {createHandler} from 'web-worker-promise-interface'

import accessibilityForGrid from './accessibility-for-grid'
import getSurface from './get-surface'
import getTransitiveData, {getPath, getPaths} from './get-transitive-data'
import isochroneTile from './isochrone-tile'
import {create as createGrid} from './grid'
import * as mercator from './mercator'
import {create as createOrigin} from './origin'
import {create as createStopTreeCache} from './stop-tree-cache'

module.exports = createHandler({
  accessibilityForGrid (ctx, message) {
    return accessibilityForGrid({
      grid: createGrid(message.grid),
      surface: ctx.surface
    })
  },
  drawTile (ctx, message) {
    return isochroneTile(message.imageData, {
      height: ctx.query.height,
      scaleFactor: message.scaleFactor,
      surface: ctx.surface.surface,
      width: ctx.query.width,
      xoffset: message.xoffset,
      yoffset: message.yoffset
    })
  },
  setOrigin (ctx, message) {
    ctx.origin = createOrigin(new Int32Array(message.arrayBuffer), message.point)
  },
  setQuery (ctx, message) {
    ctx.query = message.query
  },
  setStopTreeCache (ctx, message) {
    ctx.stopTreeCache = createStopTreeCache(new Int32Array(message.arrayBuffer), ctx.query.width * ctx.query.height)
  },
  setTransitiveNetwork (ctx, message) {
    ctx.transitiveNetwork = message.network
  },
  generateSurface (ctx, message) {
    ctx.surface = getSurface({
      cutoff: message.cutoff,
      origin: ctx.origin,
      query: ctx.query,
      stopTreeCache: ctx.stopTreeCache,
      which: message.which
    })
  },
  generateTransitiveData (ctx, message) {
    ctx.transitiveData = getTransitiveData({
      network: ctx.transitiveNetwork,
      origin: ctx.origin,
      query: ctx.query,
      stopTreeCache: ctx.stopTreeCache,
      to: message.point
    })
    return ctx.transitiveData
  },
  getContour (ctx, message) {
    ctx.contour = jsolines.getContour({
      cutoff: message.cutoff,
      height: ctx.query.height,
      surface: ctx.surface.surface,
      width: ctx.query.width
    })
    return ctx.contour
  },
  getIsochrone (ctx, message) {
    return jsolines({
      surface: ctx.surface.surface,
      width: ctx.query.width,
      height: ctx.query.height,
      cutoff: message.cutoff,
      // coords are at zoom level of query
      project: ([x, y]) => {
        return [mercator.pixelToLon(x + ctx.query.west, ctx.query.zoom), mercator.pixelToLat(y + ctx.query.north, ctx.query.zoom)]
      }
    })
  },
  getPath (ctx, message) {
    return getPath({
      pathDescriptor: message.path,
      origin: ctx.origin
    })
  },
  getPaths (ctx, message) {
    return getPaths({
      origin: ctx.origin,
      query: ctx.query,
      stopTreeCache: ctx.stopTreeCache,
      to: message.point
    })
  }
})
