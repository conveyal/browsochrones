/**
 * Create static travel time images from static site output.
 */

import fetch from 'isomorphic-fetch'
import Browsochrone from './browsochrone'

const bc = new Browsochrone()

function getQuery (url) {
  return fetch(`${url}/query.json`).then(res => res.json())
}

function getTransitiveNetwork (url) {
  return fetch(`${url}/transitive.json`).then(res => res.json())
}

function getStopTrees (url) {
  return fetch(`${url}/stop_trees.dat`).then(res => res.arrayBuffer())
}

/** x, y relative to query origin */
function getOrigin (url, x, y) {
  x |= 0 // round off, coerce to integer
  y |= 0
  return fetch(`${url}/${x}/${y}.dat`).then(res => res.arrayBuffer())
}

/** download a grid */
function getGrid (url, category) {
  return fetch(`${url}/${category}.grid`).then(res => res.arrayBuffer())
}

const baseUrl = 'http://localhost:4567'
const gridUrl = 'http://s3.amazonaws.com/analyst-static/indy-baseline/grids'

// retrieve query and stop tree cache
getQuery(baseUrl)
  .then(data => {
    bc.setQuery(data)

    // TODO fetch could happen in parallel, and just wait to build index until query is fetched
    getStopTrees(baseUrl)
      .then(data => bc.setStopTrees(data))
  .catch(err => console.error(err))
  })
  .catch(err => console.error(err))

getGrid(gridUrl, 'Jobs_total')
  .then(data => bc.setGrid(data))
  .catch(err => console.error(err))

getTransitiveNetwork(baseUrl)
  .then(data => bc.setTransitiveNetwork(data))
  .catch(err => console.error(err))

let isoLayer = null
let transitiveLayer = null

let map = window.L.map('map').setView([39.766667, -86.15], 12)

window.L.tileLayer('http://{s}.tiles.mapbox.com/v3/conveyal.hml987j0/{z}/{x}/{y}@2x.png', {
  attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery � <a href="http://mapbox.com">Mapbox</a>',
  maxZoom: 18,
  detectRetina: true
}).addTo(map)

let originSelected = false

map.on('click', function (e) {
  // get the pixel coordinates
  let {x, y} = map.project(e.latlng)
  let scale = Math.pow(2, bc.query.zoom - map.getZoom())
  x *= scale
  y *= scale

  x -= bc.query.west
  y -= bc.query.north

  if (x < 0 || x > bc.query.width || y < 0 || y > bc.query.height) return // TODO should show blank layer

  x |= 0
  y |= 0

  getOrigin(baseUrl, x, y)
    .then(origin => {
      bc.setOrigin(origin, x, y)

      console.time('surface')
      bc.generateSurface()
      console.timeEnd('surface')

      originSelected = true

      // Set the access output
      document.querySelector('#access output').value = bc.getAccessibilityForCutoff()

      if (isoLayer != null) map.removeLayer(isoLayer)

      isoLayer = window.L.tileLayer.canvas()
      isoLayer.drawTile = bc.drawTile.bind(bc)
      isoLayer.addTo(map)
    })
    .catch(err => {
      console.error(err)
      console.error(err.stack)
    })
})

map.on('mousemove', e => {
  if (originSelected) {
    let {x, y} = map.project(e.latlng)
    let scale = Math.pow(2, bc.query.zoom - map.getZoom())
    x *= scale
    y *= scale

    x -= bc.query.west
    y -= bc.query.north

    console.time('transitive data')
    let transitiveData = bc.generateTransitiveData({ x: x | 0, y: y | 0})
    console.timeEnd('transitive data')

    // add to the map
    let tr = new Transitive(transitiveData)

    if (transitiveLayer != null) {
      map.removeLayer(transitiveLayer)
    }

    transitiveLayer = new L.TransitiveLayer(tr).addTo(map)

    console.log(`${transitiveData.journeys.length} paths`)
  }
})
