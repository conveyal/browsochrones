var fetch = require('isomorphic-fetch')
var Transitive = require('transitive-js')
var L = require('mapbox.js')
require('leaflet-transitivelayer')
// react used for Marey plot
var React = require('react')
var ReactDOM = require('react-dom')
var reverse = require('lodash.reverse')

var Marey = require('./test/marey')
var MareyFactory = React.createFactory(Marey)

var LineMap = require('./test/schematic-line-map')
var LineMapFactory = React.createFactory(LineMap)

var ContourGrid = require('./test/contour-grid')
var ContourGridFactory = React.createFactory(ContourGrid)

import Browsochrone from './lib'

const bc = new Browsochrone()
const bc2 = new Browsochrone()

const baseUrl = 'https://dz69bcpxxuhn6.cloudfront.net/indy-baseline-v6'
const gridUrl = 'https://dz69bcpxxuhn6.cloudfront.net/indy-baseline-z9/intgrids'

const map = window.map = L.mapbox
  .map('map', 'conveyal.hml987j0', {
    accessToken: 'pk.eyJ1IjoiY29udmV5YWwiLCJhIjoiY2lndnI5cms4MHJ4Mnd3bTB4MzYycDc4NiJ9.C40M0KSYXGSX_IbbqN53Eg',
    tileLayer: {
      maxZoom: 18
    },
    inertia: false, // recommended when using a transitive layer
    zoomAnimation: false
  })
  .setView([39.766667, -86.15], 12)

console.log('fetching all')
Promise
  .all([
    fetch(baseUrl + '/query.json').then(function (res) { return res.json() }),
    fetch(baseUrl + '/stop_trees.dat').then(function (res) { return res.arrayBuffer() }),
    fetch(gridUrl + '/Jobs_total.grid').then(function (res) { return res.arrayBuffer() }),
    fetch(gridUrl + '/Workers_total.grid').then(function (res) { return res.arrayBuffer() })
  ])
  .then(async function (res) {
    console.log('fetched all')
    await bc.setQuery(res[0])
    await bc.setStopTrees(res[1].slice(0))
    await bc.putGrid('jobs', res[2].slice(0))
    await bc.putGrid('workers', res[3].slice(0))
    await bc.setTransitiveNetwork(res[0].transitiveData)

    await bc2.setQuery(res[0])
    await bc2.setStopTrees(res[1].slice(0))
    await bc2.putGrid('jobs', res[2].slice(0))
    await bc2.putGrid('workers', res[3].slice(0))
    await bc2.setTransitiveNetwork(res[0].transitiveData)

    console.log('loaded')
    var query = res[0]
    const center = map.unproject([query.west + query.width / 2, query.north + query.height / 2], query.zoom)
    console.log('setting center to ', center)
    map.setView(center, 11)
    map.fire('click', {latlng: {lat: 39.77424175134454, lng: -86.15478515625001}})
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

  const cutoff = document.getElementById('isochrone-cutoff').value
  console.time('getIsochrone')
  const iso = await bc.getIsochrone(cutoff)
  console.timeEnd('getIsochrone')
  if (isoLayer) map.removeLayer(isoLayer)
  isoLayer = L.geoJson(iso, {
    style: {
      weight: 3,
      color: '#f00',
      opacity: 1,
      fillColor: '#222',
      fillOpacity: 0.3
    }
  }).addTo(map)

  // Set the access output
  console.time('job access')
  const jobAccess = await bc.getAccessibilityForGrid('jobs', cutoff)
  document.getElementById('job-access').value = Math.round(jobAccess)
  console.timeEnd('job access')

  console.time('workforce access')
  const workforceAccess = await bc.getAccessibilityForGrid('workers', cutoff)
  document.getElementById('wf-access').value = Math.round(workforceAccess)
  console.timeEnd('workforce access')
}

let clickCount = 0
map.on('click', async function (e) {
  if (bc.isReady()) {
    if (clickCount % 2 === 0) {
      // get the pixel coordinates
      console.log('projecting', e.latlng)
      var point = bc.pixelToOriginPoint(map.project(e.latlng), map.getZoom())
      document.getElementById('location').value = (point.x | 0) + '/' + (point.y | 0)

      if (!bc.pointInQueryBounds(point)) {
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
        const response = await fetch(baseUrl + '/' + (point.x | 0) + '/' + (point.y | 0) + '.dat')
        const data = await response.arrayBuffer()
        console.timeEnd('fetching origin')
        await bc.setOrigin(data.slice(0), point)
        await bc2.setOrigin(data.slice(0), point)

        console.time('generating surface')
        console.time('generating both surfaces')
        await bc.generateSurface()
        console.timeEnd('generating surface')
        await bc2.generateSurface()
        console.timeEnd('generating both surfaces')

        if (surfaceLayer) map.removeLayer(surfaceLayer)
        if (isoLayer) map.removeLayer(isoLayer)

        surfaceLayer = new window.L.GridLayer()
        console.log('tile size', surfaceLayer.getTileSize())
        surfaceLayer.createTile = bc.createTile
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
    } else {
      const point = bc.pixelToOriginPoint(map.project(e.latlng), map.getZoom())

      console.time('transitive data')
      try {
        const data = await bc.generateDestinationData(point)
        console.log(data)
        const transitiveData = data.transitive
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

        let { paths, times } = data.paths

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
        const marey = MareyFactory({dest: point, paths, times, transitiveData})
        ReactDOM.render(marey, document.getElementById('marey'))

        // and schematic line map
        const lineMap = LineMapFactory({data: transitiveData})
        ReactDOM.render(lineMap, document.getElementById('lineMap'))
      } catch (e) {
        console.error(e)
      }
    }
  }

  // clickCount++ TODO: Get transitive working again
})

document.getElementById('show-isochrone').addEventListener('click', async function () {
  // click again to hide
  if (document.getElementById('isochrone').style.display === 'block') {
    document.getElementById('isochrone').style.display = 'none'
    return
  }

  document.getElementById('isochrone').style.display = 'block'

  // figure out map pos
  let bounds = map.getBounds()
  let topLeft = bc.pixelToOriginPoint(map.project(bounds.getNorthWest()), map.getZoom())
  let botRight = bc.pixelToOriginPoint(map.project(bounds.getSouthEast()), map.getZoom())

  const contourGrid = ContourGridFactory({
    contour: await bc.getContour(),
    query: bc.query,
    north: topLeft.y,
    west: topLeft.x,
    width: botRight.x - topLeft.x,
    // unlike every other projection, south is larger in web mercator
    height: botRight.y - topLeft.y
  })

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
    slider.dispatchEvent(new window.Event('input'))
    if (minute > 120) clearInterval(interval)
  })

  return false
})
