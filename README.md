# browsochrones

[![NPM version][npm-image]][npm-url]
[![Build status][travis-image]][travis-url]

Create isochrones and accessibility images in the browser

## How to create and display an isochrone (assuming you have the data!)

```js
const b = new Browsochrones({webpack: false}) // set to true if using webpack to bundle
const baseUrl = 'https://s3.amazon.com/bucket'
const cutoff = 60 // minutes
const map = Leaflet.map('map')
const lonlat = {lat: 39.766667, lon: -86.15}

(async function () {
  const query = await fetch(baseUrl + '/query.json').then((res) => res.json())
  const stopTrees = await fetch(baseUrl + '/stop_trees.dat').then((res) => res.arrayBuffer())
  const grid1 = await fetch(gridUrl + '/Jobs_total.grid').then((res) => res.arrayBuffer())
  const grid2 = await fetch(gridUrl + '/Workers_total.grid').then((res) => res.arrayBuffer())

  await b.setQuery(query)
  await b.setStopTrees(stopTrees)
  await b.putGrid(grid1, 'jobs')
  await b.putGrid(grid2, 'workforce')
  await b.setTransitiveNetwork(query.transitiveData)

  const point = b.pixelToOriginPoint(map.project(lonlat), map.getZoom())
  const data = await fetch(baseUrl + '/' + (point.x | 0) + '/' + (point.y | 0) + '.dat').then((res) => res.arrayBuffer())

  await b.setOrigin(data.slice(0), point)
  await b.generateSurface('jobs')
  await b.generateSurface('workforce')

  const surfaceLayer = new Leaflet.GridLayer()
  surfaceLayer.createTile = b.createTile // automatically bound to the instance
  surfaceLayer.addTo(map)

  const isochrone = await b.getIsochrone(cutoff) // minutes
  const isoLayer = Leaflet.geoJSON(isochrone, {
    style: {
      weight: 3,
      color: '#f00',
      opacity: 1,
      fillColor: '#222',
      fillOpacity: 0.3
    }
  }).addTo(map)

  const jobAccess = await b.getAccessibilityForGrid('jobs', cutoff)
  console.log('job access', jobAccess)
  const workforceAccess = await b.getAccessibilityForGrid('workforce', cutoff)
  console.log('workforce access', workforceAccess)
})()
```

[npm-image]: https://img.shields.io/npm/v/browsochrones.svg?maxAge=2592000&style=flat-square
[npm-url]: https://www.npmjs.com/package/browsochrones
[travis-image]: https://img.shields.io/travis/conveyal/browsochrones.svg?style=flat-square
[travis-url]: https://travis-ci.org/conveyal/browsochrones
