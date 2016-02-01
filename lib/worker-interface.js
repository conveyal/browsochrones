import jsolines from 'jsolines'

import accessibilityForGrid from './accessibility-for-grid'
import getSurface from './get-surface'
import getTransitiveData, {getPath, getPaths} from './get-transitive-data'
import isochroneTile from './isochrone-tile'
import {create as createGrid} from './grid'
import * as mercator from './mercator'
import {create as createOrigin} from './origin'
import {create as createStopTreeCache} from './stop-tree-cache'

module.exports = function (self) {
  const bc = {}

  self.addEventListener('message', function (event) {
    const {command, id, message} = event.data

    try {
      switch (command) {
        case 'accessibilityForGrid':
          self.postMessage({
            command,
            id,
            message: accessibilityForGrid({
              grid: createGrid(message.grid),
              surface: bc.surface
            })
          })
          break
        case 'drawTile':
          self.postMessage({
            command,
            id,
            message: isochroneTile(message.imageData, {
              height: bc.query.height,
              scaleFactor: message.scaleFactor,
              surface: bc.surface.surface,
              width: bc.query.width,
              xoffset: message.xoffset,
              yoffset: message.yoffset
            })
          })
          break
        case 'setOrigin':
          bc.origin = createOrigin(new Int32Array(message.arrayBuffer), message.coordinates)
          self.postMessage({id, message: true})
          break
        case 'setQuery':
          bc.query = message.query
          break
        case 'setStopTreeCache':
          bc.stopTreeCache = createStopTreeCache(new Int32Array(message.arrayBuffer), bc.query.width * bc.query.height)
          self.postMessage({id, message: true})
          break
        case 'setTransitiveNetwork':
          bc.transitiveNetwork = message.network
          break
        case 'generateSurface':
          bc.surface = getSurface({
            cutoff: message.cutoff,
            origin: bc.origin,
            query: bc.query,
            stopTreeCache: bc.stopTreeCache,
            which: message.which
          })
          self.postMessage({id, message: true})
          break
        case 'generateTransitiveData':
          bc.transitiveData = getTransitiveData({
            network: bc.transitiveNetwork,
            origin: bc.origin,
            query: bc.query,
            stopTreeCache: bc.stopTreeCache,
            to: message.coordinates
          })
          self.postMessage({id, message: bc.transitiveData})
          break
        case 'getContour':
          bc.contour = jsolines.getContour({
            cutoff: message.cutoff,
            height: bc.query.height,
            surface: bc.surface.surface,
            width: bc.query.width
          })
          self.postMessage({
            command,
            message: bc.contour
          })
          break
        case 'getIsochrone':
          self.postMessage({
            command,
            message: jsolines({
              surface: bc.surface.surface,
              width: bc.query.width,
              height: bc.query.height,
              cutoff: message.cutoff,
              // coords are at zoom level of query
              project: ([x, y]) => {
                return [mercator.pixelToLon(x + bc.query.west, bc.query.zoom), mercator.pixelToLat(y + bc.query.north, bc.query.zoom)]
              }
            })
          })
          break
        case 'getPath':
          self.postMessage({
            command,
            message: getPath({
              pathDescriptor: message.path,
              origin: bc.origin
            })
          })
          break
        case 'getPaths':
          self.postMessage({
            command,
            message: getPaths({
              origin: bc.origin,
              query: bc.query,
              stopTreeCache: bc.stopTreeCache,
              to: message.coordinates
            })
          })
          break
      }
    } catch (e) {
      e.id = id
      throw e
    }
  })
}
