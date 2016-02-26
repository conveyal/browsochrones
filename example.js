var fetch = require('isomorphic-fetch')
var Transitive = require('transitive-js')
var L = require('mapbox.js')
require('leaflet-transitivelayer')
// react used for Marey plot
var React = require('react')
var ReactDOM = require('react-dom')
var reverse = require('lodash.reverse')

var Marey = require('./test/marey').default
var MareyFactory = React.createFactory(Marey)

var LineMap = require('./test/schematic-line-map').default
var LineMapFactory = React.createFactory(LineMap)

var ContourGrid = require('./test/contour-grid').default
var ContourGridFactory = React.createFactory(ContourGrid)

var Browsochrone = require('./lib').default

const bc = new Browsochrone()
const bc2 = new Browsochrone()

const baseUrl = 'http://localhost:4567'
const gridUrl = 'http://s3.amazonaws.com/analyst-static/indy-baseline-z9/intgrids'

const grids = new Map()

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
    bc.setStopTrees(res[1].slice(0))
    grids.set('jobs', res[2])
    grids.set('workers', res[3])
    bc.setTransitiveNetwork(res[4])

    bc2.setQuery(res[0])
    bc2.setStopTrees(res[1].slice(0))
    bc2.setTransitiveNetwork(res[4])

    console.log('loaded')
    var query = res[0]
    map.setView(map.unproject([query.west + query.width / 2, query.north + query.height / 2], query.zoom), 11)
  })
  .catch(function (e) {
    console.error(e)
    console.error(e.stack)
  })

var surfaceLayer = null
var isoLayer = null
var transitiveLayer = null

async function updateIsoLayer () {
  console.log('updateIsoLayer')
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
      await bc.setOrigin(data.slice(0), coordinates)
      await bc2.setOrigin(data.slice(0), coordinates)

      console.time('generating surface')
      console.time('generating both surfaces')
      await bc.generateSurface()
      console.timeEnd('generating surface')
      await bc2.generateSurface()
      console.timeEnd('generating both surfaces')

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

      updateIsoLayer()
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
    const dest = bc.pixelToOriginCoordinates(map.project(e.latlng), map.getZoom())

    console.time('transitive data')
    try {
      const transitiveData = await bc.generateTransitiveData(dest)
      const transitive = new Transitive({data: transitiveData})
      console.timeEnd('transitive data')

      console.log(transitiveData.journeys.length + ' unique paths')

      if (transitiveLayer !== null) {
        map.removeLayer(transitiveLayer)
      }

      transitiveLayer = new L.TransitiveLayer(transitive)
      map.addLayer(transitiveLayer)
      // see leaflet.transitivelayer issue #2
      transitiveLayer._refresh()

      let { paths, times } = await bc.getPaths(dest)

      // they come out of r5 backwards
      reverse(times)
      reverse(paths)

      // clear the ones that are the same and arrive at the same time
      for (let p = 0; p < paths.length - 1; p++) {
        // + 1: time is offset one minute (wait one minute and take the trip at the next minute)
        if (times[p] === times[p + 1] + 1 && paths[p][0] === paths[p + 1][0] && paths[p][1] === paths[p + 1][1]) paths[p] = undefined
      }

      paths = await Promise.all(paths.filter(p => !!p).map(path => bc.getPath(path)))

      // set up Marey plot
      const marey = MareyFactory({dest, paths, times, transitiveData})
      ReactDOM.render(marey, document.getElementById('marey'))

      // and schematic line map
      const lineMap = LineMapFactory({data: transitiveData})
      ReactDOM.render(lineMap, document.getElementById('lineMap'))
    } catch (e) {
      console.error(e)
    }
  }
})

document.getElementById('show-isochrone').addEventListener('click', async function () {
  document.getElementById('isochrone').style.display = 'block'

  const contourGrid = ContourGridFactory({contour: await bc.getContour(), query: bc.query})
  ReactDOM.render(contourGrid, document.getElementById('isochrone'))

  return false
})

document.getElementById('isochrone-cutoff').addEventListener('input', function () {
  updateIsoLayer()
})

document.getElementById('isochrone-play').addEventListener('click', function () {
  const slider = document.getElementById('isochrone-cutoff')
  let minute = 0

  const interval = setInterval(function () {
    slider.value = minute++
    // trigger update
    slider.dispatchEvent(new Event('input'))
    if (minute > 120) clearInterval(interval)
  })

  return false
})
