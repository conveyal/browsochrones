import debug from 'debug'
import fetch from 'isomorphic-fetch'
import Leaflet from 'leaflet'
import Transitive from 'transitive-js'
import 'leaflet-transitivelayer'

import Browsochrones from './lib'

debug.enable('*')

Leaflet.Icon.Default.imagePath = 'node_modules/leaflet/dist/images/'

const b = new Browsochrones({webpack: false}) // set to true if using webpack to bundle
const baseUrl = 'https://dz69bcpxxuhn6.cloudfront.net/indy-baseline-v6'
const gridUrl = 'https://dz69bcpxxuhn6.cloudfront.net/indy-baseline-z9/intgrids'
const cutoff = 60 // minutes
const map = Leaflet.map('map', {
  center: [39.766667, -86.15],
  maxZoom: 18,
  inertia: false, // recommended when using a transitive layer
  zoom: 12,
  zoomAnimation: false
})
Leaflet.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attribution">CARTO</a>'
}).addTo(map)
const lonlat = {lat: 39.766667, lon: -86.15}
Leaflet.marker(lonlat).addTo(map)

const LAT_DEGREE = 111111 // meters
const MIN_DISTANCE = 250 // meters
const MAX_DISTANCE = 5000 // meters
const destinationLonlat = generateDestinationLonLat(lonlat)
Leaflet.marker(destinationLonlat).addTo(map)

run()
  .catch((err) => {
    console.error(err.message)
    console.error(err.stack)
  })

async function run () {
  const query = await fetch(baseUrl + '/query.json').then((res) => res.json())
  const stopTrees = await fetch(baseUrl + '/stop_trees.dat').then((res) => res.arrayBuffer())
  const grid1 = await fetch(gridUrl + '/Jobs_total.grid').then((res) => res.arrayBuffer())
  const grid2 = await fetch(gridUrl + '/Workers_total.grid').then((res) => res.arrayBuffer())
  console.log('fetched initial data')

  await b.setQuery(query)
  await b.setStopTrees(stopTrees)
  const jobsGridInfo = await b.putGrid({id: 'jobs', grid: grid1})
  const workforceGridInfo = await b.putGrid({id: 'workforce', grid: grid2})
  console.log('jobs grid: ', jobsGridInfo)
  console.log('workforce grid: ', workforceGridInfo)
  await b.setTransitiveNetwork(query.transitiveData)
  console.log('initialized browsochrones')

  const point = b.pixelToOriginPoint({pixel: map.project(lonlat), currentZoom: map.getZoom()})
  const data = await fetch(baseUrl + '/' + (point.x | 0) + '/' + (point.y | 0) + '.dat').then((res) => res.arrayBuffer())
  console.log('fetched origin point')

  const originInfo = await b.setOrigin({data: data.slice(0), point})
  console.log('origin set', originInfo)

  await b.generateSurface({gridId: 'jobs'})
  await b.generateSurface({gridId: 'workforce'})
  console.log('generated surfaces')

  const destinationPoint = b.pixelToOriginPoint({pixel: map.project(destinationLonlat), currentZoom: map.getZoom()})
  const destinationData = await b.generateDestinationData({
    from: point,
    to: destinationPoint
  })
  console.log('generated destination data for', destinationPoint, destinationData)

  const surfaceLayer = new Leaflet.GridLayer()
  surfaceLayer.createTile = b.createTile // automatically bound to the instance
  surfaceLayer.addTo(map)
  console.log('surface layer added to map')

  const isochrone = await b.getIsochrone({cutoff}) // minutes
  const isoLayer = Leaflet.geoJson(isochrone, {
    style: {
      weight: 3,
      color: '#f00',
      opacity: 1,
      fillColor: '#222',
      fillOpacity: 0.3
    }
  })
  isoLayer.addTo(map)
  console.log('isolayer added to map', isochrone)

  const transitiveLayer = new Leaflet.TransitiveLayer(new Transitive({
    data: destinationData.transitive
  }))
  map.addLayer(transitiveLayer)
  // see leaflet.transitivelayer issue #2
  transitiveLayer._refresh()
  console.log('transitive layer added to the map')

  const jobAccess = await b.getAccessibilityForGrid({gridId: 'jobs', cutoff})
  console.log('job access', jobAccess)
  const workforceAccess = await b.getAccessibilityForGrid({gridId: 'workforce', cutoff})
  console.log('workforce access', workforceAccess)
}

/**
 * Get a random point offset from the origin
 */
function generateDestinationLonLat ({
  lat,
  lon
}) {
  const latOffset = (getDistance() / LAT_DEGREE) * getSign()
  const lonOffset = (getDistance() / (LAT_DEGREE * Math.cos(lat))) * getSign()
  return {
    lat: lat + latOffset,
    lon: lon + lonOffset
  }
}

function getDistance () {
  return Math.random() * MAX_DISTANCE + MIN_DISTANCE
}

function getSign () {
  return (Math.random() * 2) > 1 ? 1 : -1
}
