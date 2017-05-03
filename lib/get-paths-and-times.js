// @flow
import fill from 'lodash/fill'

import {ITERATION_WIDTH} from './constants'
import {getNonTransitTime} from './utils'

import type {Origin, Query, StopTreeCache, PathDescriptor, Point} from './types'

/**
 * Get an array of [stop, path] for each departure minute
 */
export default function getPathsAndTimes ({
  origin,
  query,
  stopTreeCache,
  to
}: {
  origin: Origin,
  query: Query,
  stopTreeCache: StopTreeCache,
  to: Point
}): {
  paths: Array<PathDescriptor>,
  times: Uint8Array
} {
  const paths = new Array(origin.nMinutes)
  const times = new Uint8Array(origin.nMinutes)
  // fill with non transit time, so we don't include suboptimal transit trips
  const nonTransitTime = getNonTransitTime(origin, to)
  fill(times, nonTransitTime)

  // if non-transit-times is less than 255, we can just walk here, so
  // preinitialize the paths with a placeholder for walking all the way
  if (nonTransitTime < 255) fill(paths, [-1, -1])

  const y = to.y | 0
  const x = to.x | 0

  // we're outside the query, bail
  if (x >= query.width || x < 0 || y >= query.height || y < 0) {
    return {paths, times}
  }

  let stcOffset = stopTreeCache.index[y * query.width + x]
  const reachableStops = stopTreeCache.data[stcOffset++]

  for (let stopIdx = 0; stopIdx < reachableStops; stopIdx++) {
    const stopId = stopTreeCache.data[stcOffset++]
    const accessTime = stopTreeCache.data[stcOffset++]
    const originOffset = origin.index[stopId]

    // minute, stopTime and pathIdx are delta-coded _per stop_
    for (let minute = 0; minute < origin.nMinutes; minute++) {
      const stopTime = origin.data[originOffset + minute * ITERATION_WIDTH]
      const pathIdx = origin.data[originOffset + minute * ITERATION_WIDTH + 3]

      // reachable at this minute
      if (stopTime !== -1) {
        const time = stopTime + accessTime

        // no need to check if time < 255 because times[minute] is at most 255
        if (time < times[minute]) {
          times[minute] = time
          paths[minute] = [stopId, pathIdx]
        }
      }
    }
  }

  return {paths, times}
}
