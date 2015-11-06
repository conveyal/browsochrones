/**
 * Create static travel time images from static site output.
 */

import fetch from 'isomorphic-fetch'

import getSurface from './get-surface'
import accessibilityForCutoff from './accessibility-for-cutoff'
import isochroneTile from './isochrone-tile'

function getQuery (url) {
  return fetch(`${url}query.json`).then(res => res.json())
}

function getStopTrees (url) {
  return fetch(`${url}stop_trees.dat`)
    .then(res => res.arrayBuffer())
    .then(ab => new Int32Array(ab))
    .then(sta => {
      console.log(`Stop trees ${Math.round(sta.byteLength / 1000)}kb uncompressed`)
      return sta
    })
}

/** x, y relative to query origin */
function getOrigin (url, x, y) {
  x |= 0 // round off, coerce to integer
  y |= 0
  return fetch(`${url}${x}/${y}.dat`)
    .then(res => res.arrayBuffer())
    .then(ab => new Int32Array(ab))
    .then(origin => {
      console.log(`Origin ${Math.round(origin.byteLength / 1000)}kb uncompressed`)
      return origin
    })
}

/** download a grid */
function getGrid (url, category) {
  return fetch(`${url}grids/${category}.grid`)
    .then(res => res.arrayBuffer())
    .then(res => {
      // de-delta-code
      // skip header in data
      let arr = new Float64Array(res, 24)

      console.log(`Grid ${arr.byteLength / 1000}kb uncompressed`)

      for (let i = 0, prev = 0; i < arr.length; i++) {
        arr[i] = (prev += arr[i])
      }

      let dv = new DataView(res)
      return {
        // parse header
        zoom: dv.getInt32(0, true),
        west: dv.getInt32(4, true),
        north: dv.getInt32(8, true),
        width: dv.getInt32(12, true),
        height: dv.getInt32(16, true),
        data: arr
      }
    })
}

const baseUrl = 'http://s3.amazonaws.com/analyst-static/indy-baseline/'

// retrieve query and stop tree cache
let query
getQuery(baseUrl)
  .then(data => {
    query = data
  })
  .catch(err => console.error(err))

let stopTreeCache
getStopTrees(baseUrl)
  .then(data => {
    stopTreeCache = data
  })
  .catch(err => console.error(err))

let grid
getGrid(baseUrl, 'Jobs_total')
  .then(data => {
    grid = data
  })
  .catch(err => console.error(err))

let isoLayer = null

let map = window.L.map('map').setView([39.766667, -86.15], 12)

window.L.tileLayer('http://{s}.tiles.mapbox.com/v3/conveyal.hml987j0/{z}/{x}/{y}@2x.png', {
  attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery � <a href="http://mapbox.com">Mapbox</a>',
  maxZoom: 18,
  detectRetina: true
}).addTo(map)

map.on('click', function (e) {
  // get the pixel coordinates
  let pxpt = map.project(e.latlng)
  let x = pxpt.x
  let y = pxpt.y
  let scale = Math.pow(2, query.zoom - map.getZoom())
  x *= scale
  y *= scale

  x -= query.west
  y -= query.north

  if (x < 0 || x > query.width || y < 0 || y > query.height) return // todo should show blank layer

  getOrigin(baseUrl, x, y)
    .then(origin => {
      console.time('surface')
      let surface = getSurface(query, stopTreeCache, origin, x, y, 'AVERAGE', grid)
      console.timeEnd('surface')

      console.time('accessibility')
      let access = accessibilityForCutoff(surface, 60, 'AVERAGE')
      console.timeEnd('accessibility')

      document.querySelector('#access output').value = access

      if (isoLayer != null) map.removeLayer(isoLayer)

      isoLayer = window.L.tileLayer.canvas()
      isoLayer.drawTile = function (canvas, tilePoint, zoom) {
        isochroneTile(canvas, tilePoint, zoom, query, surface, 60)
      }

      isoLayer.addTo(map)
    })
    .catch(err => console.error(err))
})
