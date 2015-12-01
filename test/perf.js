import concat from 'concat-stream'
import fetch from 'isomorphic-fetch'
import test from 'tape'

import Browsochrone from '../lib'

const bc = new Browsochrone()
const baseUrl = 'http://localhost:4567'
const coordinates = {
  x: 245,
  y: 268
}
const gridUrl = 'http://s3.amazonaws.com/analyst-static/indy-baseline/grids'

test('load', (assert) => {
  Promise
    .all([
      fetch(`${baseUrl}/query.json`).then(res => res.json()),
      fetch(`${baseUrl}/stop_trees.dat`).then(responseToBuffer),
      fetch(`${gridUrl}/Jobs_total.grid`).then(responseToBuffer),
      fetch(`${baseUrl}/transitive.json`).then(res => res.json()),
      fetch(`${baseUrl}/${coordinates.x | 0}/${coordinates.y | 0}.dat`).then(responseToBuffer)
    ])
    .then(res => {
      bc.setQuery(res[0])
      bc.setStopTrees(res[1])
      bc.setGrid(res[2])
      bc.setTransitiveNetwork(res[3])

      assert.ok(bc.isReady(), 'Browsochrones is ready')

      bc.setOrigin(res[4], coordinates)
      assert.ok(bc.isLoaded(), 'Browsochrones is loaded')

      assert.end()
    })
    .catch(e => {
      console.error(e)
      console.error(e.stack)

      assert.error(e)
      assert.end(e)
    })
})

const surfaceLength = 213280
const access = 14400
const nMinutes = 120

test('generateSurface', (assert) => {
  console.time('generateSurface')
  const surface = bc.generateSurface()
  console.timeEnd('generateSurface')

  assert.equal(surfaceLength, surface.surface.length)
  assert.equal(access, surface.access.length)
  assert.equal(nMinutes, surface.nMinutes)
  assert.end()
})

function responseToBuffer (res) {
  return new Promise((resolve, reject) => {
    res.body.on('error', reject)
    res.body.pipe(concat(buffer => {
      resolve(toArrayBuffer(buffer))
    }))
  })
}

function toArrayBuffer (buffer) {
  const ab = new ArrayBuffer(buffer.length)
  const view = new Uint8Array(ab)
  for (var i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i]
  }
  return ab
}
