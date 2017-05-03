// @flow
import slice from 'lodash/slice'

import {ITERATION_WIDTH, MAX_PATH_SEGMENTS} from './constants'

import type {Origin, PathDescriptor, Point, StopPatternStops} from './types'

/**
 * Represents the data for a single origin, including a per-transit-stop index.
 * @author mattwigway
 * @param {ArrayBuffer} data
 * @param {Point} point
 * @returns {Origin}
 */
export function create ({
  data,
  log = console.log.bind(console),
  point
}: {
  data: Int32Array,
  log: Function,
  point: Point
}): Origin {
  const origin = {}

  origin.data = data

  origin.x = point.x
  origin.y = point.y

  // de-delta-code non transit timess
  let offset = 0
  origin.radius = data[offset++]
  const nPixels = Math.pow(origin.radius * 2 + 1, 2)

  log(`origin radius: ${origin.radius} nPixels: ${nPixels}`)
  for (let pixel = 0, nonTransitTime = 0; pixel < nPixels; pixel++) {
    nonTransitTime += data[offset] // don't increment offset here, will be incremented on write
    data[offset++] = nonTransitTime // increment offset here
  }

  // build index
  const nStops = data[offset++]
  const nMinutes = data[offset++]
  origin.nStops = nStops
  origin.nMinutes = nMinutes
  log(`origin nStops: ${nStops} nMinutes: ${nMinutes}`)

  origin.index = new Int32Array(nStops)

  for (let stop = 0; stop < nStops; stop++) {
    origin.index[stop] = offset

    // de delta code times and paths
    for (let min = 0, tvlTime = 0, inVehicleTravelTime = 0, waitTime = 0, path = 0; min < nMinutes; min++) {
      tvlTime += origin.data[offset + min * ITERATION_WIDTH]
      origin.data[offset + min * ITERATION_WIDTH] = tvlTime

      inVehicleTravelTime += origin.data[offset + min * ITERATION_WIDTH + 1]
      origin.data[offset + min * ITERATION_WIDTH + 1] = inVehicleTravelTime

      waitTime += origin.data[offset + min * ITERATION_WIDTH + 2]
      origin.data[offset + min * ITERATION_WIDTH + 2] = waitTime

      path += origin.data[offset + min * ITERATION_WIDTH + 3]
      origin.data[offset + min * ITERATION_WIDTH + 3] = path
    }

    // skip the times
    offset += nMinutes * ITERATION_WIDTH

    // read paths
    const nPaths = data[offset++]

    for (let path = 0; path < nPaths; path++) {
      const pathLen = data[offset++]
      offset += pathLen * 3 // 3 ints for each segment: board, pattern, and alight
    }
  }

  // Javascript does no bounds checks. Ensure we didn't under or overrun.
  if (offset !== data.length) {
    throw new Error('Data for origin corrupted (network issues?)')
  }

  return origin
}

/**
 * Get `StopPatternStop` set for a path descriptor
 */
export function getStopPatternStopSets ({
 log = console.log.bind(console),
 origin,
 pathDescriptor
}: {
  log: Function,
  origin: Origin,
  pathDescriptor: PathDescriptor
}): StopPatternStops {
  const [stop, pathIdx] = pathDescriptor
  if (stop === -1) return []
  // offset to the first path, skipping times and nPaths
  let offset = origin.index[stop] + origin.nMinutes * ITERATION_WIDTH + 1

  // seek forward to correct path
  let curIdx = 0
  while (curIdx++ < pathIdx) {
    const nSegments = origin.data[offset++]
    offset += nSegments * 3
  }

  const nSegments = origin.data[offset++]

  if (nSegments > MAX_PATH_SEGMENTS) {
    // bail if we have a ridiculous path (clearly a data/code error), and complain loudly
    log(`Too many path segments (${nSegments} > ${MAX_PATH_SEGMENTS}) in path ${pathIdx} to stop ${stop} from origin ${origin.x}, ${origin.y}, returning no path. This implies a bug, please raise cain about it`)
    return []
  }

  const path = []
  for (let seg = 0; seg < nSegments; seg++) {
    // not delta coded
    // TODO is creating typed arrays which may be inefficient for small values
    path.push(slice(origin.data, offset, offset + 3))
    offset += 3
  }

  return path
}
