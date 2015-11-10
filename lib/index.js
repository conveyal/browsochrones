/**
 * Create static travel time images from static site output.
 */

import fetch from 'isomorphic-fetch'

import Browsochrone from './browsochrone'

const bc = new Browsochrone()

const localUrl = 'http://localhost:3000/test/data'
const baseUrl = 'http://s3.amazonaws.com/analyst-static/indy-baseline'

Promise
  .all([
    fetch(`${localUrl}/query.json`).then(res => res.json()),
    fetch(`${localUrl}/stop_trees.data`).then(res => res.arrayBuffer()),
    fetch(`${localUrl}/Jobs_total.grid`).then(res => res.arrayBuffer())
  ])
  .then(([query, stopTrees, grid]) => {
    bc.setQuery(query)
    bc.setStopTrees(stopTrees)
    bc.setGrid(grid)
  })
  .catch(e => {
    console.error(e)
    console.error(e.stack)
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
  const {x, y} = bc.pixelToOriginCoordinates(map.project(e.latlng), map.getZoom())

  if (!bc.coordinatesInQueryBounds({x, y})) {
    if (isoLayer) {
      map.removeLayer(isoLayer)
      isoLayer = null
    }
    return
  }

  fetch(`${baseUrl}/${x | 0}/${y | 0}.dat`)
    .then(res => res.arrayBuffer())
    .then(origin => {
      bc.setOrigin(origin)

      console.time('surface')
      bc.generateSurface()
      console.timeEnd('surface')

      // Set the access output
      document.querySelector('#access output').value = bc.getAccessibilityForCutoff()

      if (isoLayer) map.removeLayer(isoLayer)

      isoLayer = window.L.tileLayer.canvas()
      isoLayer.drawTile = bc.drawTile.bind(bc)
      isoLayer.addTo(map)
    })
    .catch(err => {
      if (isoLayer) {
        map.removeLayer(isoLayer)
        isoLayer = null
      }

      console.error(err)
      console.error(err.stack)
    })
})
