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
var Grid = Browsochrone.Grid

var bc = new Browsochrone()

var baseUrl = 'http://localhost:4567'
var gridUrl = 'http://s3.amazonaws.com/analyst-static/indy-baseline-z9/intgrids'

var grids = new Map()

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
    grids.set('jobs', new Grid(res[2]))
    grids.set('workers', new Grid(res[3]))
    bc.setTransitiveNetwork(res[4])
  })
  .catch(function (e) {
    console.error(e)
    console.error(e.stack)
  })

var surfaceLayer = null
var isoLayer = null
var transitiveLayer = null

var map = window.L.mapbox
  .map('map', 'conveyal.hml987j0', {
    accessToken: 'pk.eyJ1IjoiY29udmV5YWwiLCJhIjoiY2lndnI5cms4MHJ4Mnd3bTB4MzYycDc4NiJ9.C40M0KSYXGSX_IbbqN53Eg',
    tileLayer: {
      maxZoom: 18
    },
    inertia: false, // recommended when using a transitive layer
    zoomAnimation: false
  })
  .setView([39.766667, -86.15], 12)

var updateIsoLayer = function () {
  if (isoLayer) map.removeLayer(isoLayer)

  var cutoff = document.getElementById('isochrone-cutoff').value

  var iso = bc.getIsochrone(cutoff)
  isoLayer = window.L.geoJson(iso,
    {
      style: {
        weight: 3,
        color: '#f00',
        opacity: 1,
        fillColor: '#222',
        fillOpacity: 0.3
      }
    }).addTo(map)
}

map.on('click', function (e) {
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
    fetch(baseUrl + '/' + (coordinates.x | 0) + '/' + (coordinates.y | 0) + '.dat')
      .then(function (res) { return res.arrayBuffer() })
      .then(function (data) {
        console.timeEnd('fetching origin')
        bc.setOrigin(data, coordinates)

        console.time('generating surface')
        bc.generateSurface().then(surface => {
          console.timeEnd('generating surface')

          // Set the access output
          console.time('job access')
          document.getElementById('job-access').value = Math.round(bc.getAccessibilityForGrid(grids.get('jobs')))
          console.timeEnd('job access')

          console.time('workforce access')
          document.getElementById('wf-access').value = Math.round(bc.getAccessibilityForGrid(grids.get('workers')))
          console.timeEnd('workforce access')

          if (surfaceLayer) map.removeLayer(surfaceLayer)
          if (isoLayer) map.removeLayer(isoLayer)

          surfaceLayer = window.L.tileLayer.canvas()
          surfaceLayer.drawTile = bc.drawTile.bind(bc)
          surfaceLayer.addTo(map)

          updateIsoLayer()
        }).catch(err => {
          console.error(err)
        })
      })
      .catch(function (err) {
        if (surfaceLayer) {
          map.removeLayer(surfaceLayer)
          surfaceLayer = null
        }

        console.error(err)
        console.error(err.stack)
      })
  }
})

map.on('mousemove', function (e) {
  if (bc.isLoaded()) {
    var dest = bc.pixelToOriginCoordinates(map.project(e.latlng), map.getZoom())

    console.time('transitive data')
    var transitiveData = bc.generateTransitiveData(dest)
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
