/**
 * Create static travel time images from static site output.
 */

import request from 'browser-request'
import fetch from 'isomorphic-fetch'

import getSurface from './get-surface'
import accessibilityForCutoff from './accessibility-for-cutoff'
import isochroneTile from './isochrone-tile'

function getQuery (url, cb) {
  request({url: `${url}query.json`, gzip: true}, (err, data, body) => {
    if (err) console.error(err)
    cb(JSON.parse(body))
  })
}

function getStopTrees (url, cb) {
  fetch(`${url}stop_trees.dat`).then(res => res.arrayBuffer())
    .then(res => {
      let buf = new Int32Array(res)
      console.log(`Stop trees ${Math.round(buf.byteLength / 1000)}kb uncompressed`)
      cb(buf)
    })
}

/** x, y relative to query origin */
function getOrigin (url, x, y, cb) {
  x |= 0 // round off, coerce to integer
  y |= 0
  fetch(`${url}${x}/${y}.dat`).then(res => res.arrayBuffer())
    .then(res => {
      let buf = new Int32Array(res)
      console.log(`Origin ${Math.round(buf.byteLength / 1000)}kb uncompressed`)
      cb(buf)
    })
}

/** download a grid */
function getGrid (url, category, cb) {
  fetch(`${url}grids/${category}.grid`).then(res => res.arrayBuffer())
    .then(res => {
      console.log(`Grid ${res.length / 1000}kb uncompressed`)

      // de-delta-code
      // skip header in data
      let arr = new Float64Array(res, 24)

      for (let i = 0, prev = 0; i < arr.length; i++) {
        arr[i] = (prev += arr[i])
      }

      let dv = new DataView(res)
      cb({
        // parse header
        zoom: dv.getInt32(0, true),
        west: dv.getInt32(4, true),
        north: dv.getInt32(8, true),
        width: dv.getInt32(12, true),
        height: dv.getInt32(16, true),
        data: arr
      })
    })
}

const baseUrl = 'http://s3.amazonaws.com/analyst-static/indy-baseline/'

// retrieve query and stop tree cache
let query
getQuery(baseUrl, function (data) {
  query = data
})

let stopTreeCache
getStopTrees(baseUrl, function (data) {
  stopTreeCache = data
})

let grid
getGrid(baseUrl, 'Jobs_total', function (data) {
  grid = data
})

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

  getOrigin(baseUrl, x, y, function (origin) {
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
})
