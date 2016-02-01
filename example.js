var fetch = require('isomorphic-fetch')
var Transitive = require('transitive-js')
var L = require('mapbox.js')
require('leaflet-transitivelayer')
// react used for Marey plot
var React = require('react')
var ReactDOM = require('react-dom')
var Marey = require('./test/marey').default
var MareyFactory = React.createFactory(Marey)

var LineMap = require('./test/schematic-line-map').default
var LineMapFactory = React.createFactory(LineMap)

var ContourGrid = require('./test/contour-grid').default
var ContourGridFactory = React.createFactory(ContourGrid)

var Browsochrone = require('./lib').default

const bc = new Browsochrone()

const baseUrl = 'http://localhost:4567'
const gridUrl = 'http://s3.amazonaws.com/analyst-static/indy-baseline-z9/intgrids'

const grids = new Map()

Promise
  .all([
    fetch(baseUrl + '/query.json').then(function (res) { return res.json() }),
    fetch(baseUrl + '/stop_trees.dat').then(function (res) { return res.arrayBuffer() }),
    fetch(gridUrl + '/Jobs_total.grid').then(function (res) { return res.arrayBuffer() }),
    fetch(gridUrl + '/Workers_total.grid').then(function (res) { return res.arrayBuffer() }),
    fetch(baseUrl + '/transitive.json').then(function (res) { return res.json() })
  ])
  .then(function (res) {
    bc.setQuery(res[0])
    bc.setStopTrees(res[1])
    grids.set('jobs', res[2])
    grids.set('workers', res[3])
    bc.setTransitiveNetwork(res[4])
  })
  .catch(function (e) {
    console.error(e)
    console.error(e.stack)
  })

var surfaceLayer = null
var isoLayer = null
var transitiveLayer = null

const map = L.mapbox
  .map('map', 'conveyal.hml987j0', {
    accessToken: 'pk.eyJ1IjoiY29udmV5YWwiLCJhIjoiY2lndnI5cms4MHJ4Mnd3bTB4MzYycDc4NiJ9.C40M0KSYXGSX_IbbqN53Eg',
    tileLayer: {
      maxZoom: 18
    },
    inertia: false, // recommended when using a transitive layer
    zoomAnimation: false
  })
  .setView([39.766667, -86.15], 12)

async function updateIsoLayer () {
  if (isoLayer) map.removeLayer(isoLayer)

  const cutoff = document.getElementById('isochrone-cutoff').value
  console.time('getIsochrone')
  const iso = await bc.getIsochrone(cutoff)
  console.timeEnd('getIsochrone')
  isoLayer = L.geoJson(iso, {
    style: {
      weight: 3,
      color: '#f00',
      opacity: 1,
      fillColor: '#222',
      fillOpacity: 0.3
    }
  }).addTo(map)
}

map.on('click', async function (e) {
  if (bc.isReady()) {
    // get the pixel coordinates
    var coordinates = bc.pixelToOriginCoordinates(map.project(e.latlng), map.getZoom())
    document.getElementById('location').value = (coordinates.x | 0) + '/' + (coordinates.y | 0)

    if (!bc.coordinatesInQueryBounds(coordinates)) {
      if (surfaceLayer) {
        map.removeLayer(surfaceLayer)
        surfaceLayer = null
      }

      if (isoLayer) {
        map.removeLayer(isoLayer)
        isoLayer = null
      }

      return
    }

    console.time('fetching origin')
    try {
      const response = await fetch(baseUrl + '/' + (coordinates.x | 0) + '/' + (coordinates.y | 0) + '.dat')
      const data = await response.arrayBuffer()
      console.timeEnd('fetching origin')
      await bc.setOrigin(data, coordinates)

      console.time('generating surface')
      await bc.generateSurface()
      console.timeEnd('generating surface')

      // Set the access output
      console.time('job access')
      const jobAccess = await bc.getAccessibilityForGrid(grids.get('jobs'))
      document.getElementById('job-access').value = Math.round(jobAccess)
      console.timeEnd('job access')

      console.time('workforce access')
      const workforceAccess = await bc.getAccessibilityForGrid(grids.get('workers'))
      document.getElementById('wf-access').value = Math.round(workforceAccess)
      console.timeEnd('workforce access')

      if (surfaceLayer) map.removeLayer(surfaceLayer)
      if (isoLayer) map.removeLayer(isoLayer)

      surfaceLayer = window.L.tileLayer.canvas()
      surfaceLayer.drawTile = bc.drawTile.bind(bc)
      surfaceLayer.addTo(map)

      await updateIsoLayer()
    } catch (err) {
      if (surfaceLayer) {
        map.removeLayer(surfaceLayer)
        surfaceLayer = null
      }

      console.error(err)
      console.error(err.stack)
    }
  }
})

map.on('mousemove', async function (e) {
  if (bc.isLoaded()) {
    var dest = bc.pixelToOriginCoordinates(map.project(e.latlng), map.getZoom())

    console.time('transitive data')
    try {
      const transitiveData = await bc.generateTransitiveData(dest)
      var transitive = new Transitive({data: transitiveData})
      console.timeEnd('transitive data')

      console.log(transitiveData.journeys.length + ' unique paths')

      if (transitiveLayer != null) {
        map.removeLayer(transitiveLayer)
      }

      transitiveLayer = new L.TransitiveLayer(transitive)
      map.addLayer(transitiveLayer)
      // see leaflet.transitivelayer issue #2
      transitiveLayer._refresh()

      // set up Marey plot
      var marey = MareyFactory({browsochrones: bc, dest: dest})
      ReactDOM.render(marey, document.getElementById('marey'))

      // and schematic line map
      var lineMap = LineMapFactory({data: transitiveData})
      ReactDOM.render(lineMap, document.getElementById('lineMap'))
    } catch (e) {
      console.error(e)
    }
  }
})

document.getElementById('show-isochrone').addEventListener('click', function () {
  document.getElementById('isochrone').style.display = 'block'

  var contourGrid = ContourGridFactory({surface: bc.surface, query: bc.query})
  ReactDOM.render(contourGrid, document.getElementById('isochrone'))

  return false
})

document.getElementById('isochrone-cutoff').addEventListener('input', function () {
  updateIsoLayer()
})

document.getElementById('isochrone-play').addEventListener('click', function () {
  var slider = document.getElementById('isochrone-cutoff')
  var minute = 0

  var interval
  interval = setInterval(function () {
    slider.value = minute++
    // trigger update
    slider.dispatchEvent(new Event('input'))
    if (minute > 120) clearInterval(interval)
  })

  return false
})
