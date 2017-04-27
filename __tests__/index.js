/* global describe, expect, it */

import fs from 'fs'
import path from 'path'

import accessibilityForGrid from '../lib/accessibility-for-grid'
import generateDestinationData from '../lib/generate-destination-data'
import getIsochrone from '../lib/get-isochrone'
import {create as createSurface} from '../lib/surface'
import {create as createGrid} from '../lib/grid'
import {create as createOrigin} from '../lib/origin'
import {create as createStopTreeCache} from '../lib/stop-tree-cache'

const DATA = path.join(__dirname, '/data')
const DEST_POINT = {x: 158, y: 140}
const ORIGIN_POINT = {x: 125, y: 136}
const which = 'MEDIAN'

const jobsGrid = fs.readFileSync(`${DATA}/jobs.grid`).buffer
const originData = fs.readFileSync(`${DATA}/origin.dat`).buffer
const query = JSON.parse(fs.readFileSync(`${DATA}/query.json`, 'utf8'))
const stopTrees = fs.readFileSync(`${DATA}/stop_trees.dat`).buffer

const ctx = {}

describe('Browsochrones', () => {
  it('create stop tree cache', () => {
    ctx.stopTreeCache = createStopTreeCache({
      data: new Int32Array(stopTrees),
      size: query.width * query.height
    })
    const {index} = ctx.stopTreeCache
    expect(index.length).toMatchSnapshot()
    expect(index[0]).toMatchSnapshot()
    expect(index[index.length / 2]).toMatchSnapshot()
    expect(index[index.length - 1]).toMatchSnapshot()
  })

  it('create grid', () => {
    ctx.grid = createGrid(jobsGrid)
    const {data, ...snapshot} = ctx.grid
    expect(snapshot).toMatchSnapshot()
  })

  it('create origin', () => {
    ctx.origin = createOrigin({
      data: new Int32Array(originData),
      point: ORIGIN_POINT
    })
    const {data, index, ...snapshot} = ctx.origin
    expect(snapshot).toMatchSnapshot()
  })

  it('generate surface', () => {
    ctx.surface = createSurface({
      ...ctx,
      query,
      which
    })
    const {surface, ...snapshot} = ctx.surface
    expect(summarizeSnapshot(snapshot)).toMatchSnapshot()
  })

  it('generate destination data', () => {
    const snapshot = generateDestinationData({
      ...ctx,
      ...ctx.surface,
      from: ORIGIN_POINT,
      query,
      to: DEST_POINT,
      transitiveNetwork: query.transitiveData
    })
    expect(summarizeSnapshot(snapshot)).toMatchSnapshot()
  })

  it('get isochrone', () => {
    const isochrone = getIsochrone({
      ...query,
      surface: ctx.surface.surface
    })
    expect(summarizeSnapshot(isochrone)).toMatchSnapshot()
  })

  it('get accessibility for grid', () => {
    const access = accessibilityForGrid({
      grid: ctx.grid,
      query,
      surface: ctx.surface.surface
    })
    expect(access).toMatchSnapshot()
  })
})

function summarizeSnapshot (s, k) {
  if (Array.isArray(s) || ArrayBuffer.isView(s)) {
    return {
      [`first${k ? `-${k}` : ''}`]: summarizeSnapshot(s[0]),
      [`last${k ? `-${k}` : ''}`]: summarizeSnapshot(s[s.length - 1]),
      length: s.length
    }
  }
  if (typeof s === 'object') {
    const copy = {...s}
    Object.keys(copy).forEach((k) => {
      copy[k] = summarizeSnapshot(copy[k], k)
    })
    return copy
  }
  if (typeof s === 'number' && !Number.isInteger(s)) {
    return Number(s.toFixed(8)) // precision varies per environment (?)
  }
  return s
}
