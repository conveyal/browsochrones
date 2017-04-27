// @flow
import lonlat from '@conveyal/lonlat'
import {hsl} from 'd3-color'

import {
  MAX_DISSIMILARITY,
  MAX_TRANSITIVE_PATHS
} from './constants'
import {pixelToLat, pixelToLon} from './mercator'
import {getStopPatternStopSets} from './origin'

import type {
  Journey,
  Origin,
  PathDescriptor,
  Pattern,
  Point,
  Query,
  Segment,
  Stop,
  StopPatternStops,
  TransitiveData
} from './types'

/**
 * Create transitive data for journeys from a particular origin to a
 * particular destination
 */
export default function getTransitiveData ({
  from,
  log,
  origin,
  paths,
  query,
  to,
  transitiveNetwork
}: {
  from: Point,
  log: Function,
  origin: Origin,
  paths: Array<PathDescriptor>,
  query: Query,
  to: Point,
  transitiveNetwork: TransitiveData
}): TransitiveData {
  const places = []
  const journeys = []

  // from can be left null and it will be inferred from the destination
  let fromCoord = {}
  let fromName = null
  if (from != null) {
    const {x, y, ...rest} = from
    try {
      fromCoord = lonlat(rest)
    } catch (e) {
      log(e.message)
    }
    fromName = from.name
  }

  places.push({
    place_id: 'from',
    place_name: fromName, // todo do this with icons, avoid English works (or Portuguese words, for that matter)
    place_lat: fromCoord.lat || pixelToLat(query.north + origin.y, query.zoom),
    place_lon: fromCoord.lon || pixelToLon(query.west + origin.x, query.zoom)
  })

  // to cannot be undefined
  // Omit X and Y so as not to confuse lonlng
  const { x, y, ...rest } = to
  let toCoord = {}
  try {
    toCoord = lonlat(rest)
  } catch (e) {
    log(e.message)
  }

  places.push({
    place_id: 'to',
    place_name: to.name,
    place_lat: toCoord.lat || pixelToLat(query.north + to.y, query.zoom),
    place_lon: toCoord.lon || pixelToLon(query.west + to.x, query.zoom)
  })

  // function to convert pattern ID to route ID
  function getRouteIndexFromPatternId (pattern: string | number): number {
    const pat = transitiveNetwork.patterns.find(p => p.pattern_id === String(pattern))
    if (!pat) return -1
    return transitiveNetwork.routes.findIndex(r => r.route_id === pat.route_id)
  }

  // get the most common, unique paths
  const commonPaths = getCommonPaths({
    getRouteIndexFromPatternId,
    log,
    origin,
    paths: paths.filter((p) => !!p)
  })

  for (let pidx = 0; pidx < commonPaths.length; pidx++) {
    const journey = {
      journey_id: pidx,
      journey_name: pidx,
      segments: []
    }

    const path = commonPaths[pidx]

    // bail if the path-finding algorithm gave up, this is a bug but we'd rather
    // log a javascript error than crash the tab (??)
    if (path === null) continue

    if (path.length > 20) {
      log('excessive path length, more than 20 segments')
      continue
    }

    if (path.length === 0) {
      // walk to destination
      journey.segments.push({
        type: 'WALK',
        from: {
          type: 'PLACE',
          place_id: 'from'
        },
        to: {
          type: 'PLACE',
          place_id: 'to'
        }
      })
    } else {
      // add the first walk segment
      const originStop = path[0][0]
      journey.segments.push({
        type: 'WALK',
        from: {
          type: 'PLACE',
          place_id: 'from'
        },
        to: {
          type: 'STOP',
          stop_id: originStop + ''
        }
      })

      let previousStop = -1

      for (let segmentIdx = 0; segmentIdx < path.length; segmentIdx++) {
        const [boardStop, pattern, alightStop] = path[segmentIdx]

        // figure out from and to stop indices
        const fromStopId = boardStop + ''
        const toStopId = alightStop + ''

        let index = 0
        const patternData = transitiveNetwork.patterns[pattern]

        while (patternData.stops[index].stop_id !== fromStopId) index++
        const fromStopIdx = index
        while (patternData.stops[index].stop_id !== toStopId) index++
        const toStopIdx = index

        if (previousStop > 0 && previousStop !== boardStop) {
          // there is an on-street transfer
          journey.segments.push({
            type: 'WALK',
            from: {
              type: 'STOP',
              stop_id: previousStop + ''
            },
            to: {
              type: 'STOP',
              stop_id: boardStop + ''
            }
          })
        }

        // add the transit segment
        journey.segments.push({
          type: 'TRANSIT',
          pattern_id: pattern + '',
          from_stop_index: fromStopIdx,
          to_stop_index: toStopIdx
        })

        previousStop = alightStop
      }

      // add the final walk
      journey.segments.push({
        type: 'WALK',
        from: {
          type: 'STOP',
          stop_id: previousStop + ''
        },
        to: {
          type: 'PLACE',
          place_id: 'to'
        }
      })
    }

    journeys.push(journey)
  }

  const clusteredJourneys = clusterJourneys({
    ...transitiveNetwork,
    journeys,
    log
  })

  const color = hsl('#b00')
  clusteredJourneys.forEach(c => {
    color.h += 67
    const rgb = color + ''
    c.segments.forEach(s => {
      s.color = rgb
    })
  })

  return {
    ...transitiveNetwork,
    journeys: clusteredJourneys,
    places
  }
}

type PathCount = {
  count: number,
  path: PathDescriptor
}

function countCommonPaths (
  memo: Array<PathCount>,
  path: PathDescriptor,
  index: number
): Array<PathCount> {
  if (index === 0) return [{count: 1, path}]
  if (memo[0].path[0] !== path[0] || memo[0].path[1] !== path[1]) {
    return [{count: 1, path}, ...memo]
  }
  memo[0].count++
  return memo
}

const byCount = (p1, p2) => p2.count - p1.count
const byStopIdAndPathIndex = (p1, p2) => {
  const v0 = p1[0] - p2[0] // sort first by stop ID
  if (v0 !== 0) return v0
  else return p1[1] - p2[1] // then by path index
}
const uniquePathIds = (p, idx, arr) =>
  idx === 0 || p[0] !== arr[idx - 1][0] || p[1] !== arr[idx - 1][1]

/**
 * Get the most common paths
 */
function getCommonPaths ({
  getRouteIndexFromPatternId,
  log,
  origin,
  paths
}: {
  getRouteIndexFromPatternId: Function,
  log: Function,
  origin: Origin,
  paths: Array<PathDescriptor>
}): Array<StopPatternStops> {
  paths.sort(byStopIdAndPathIndex)
  const pathCounts = paths.reduce(countCommonPaths, [])
  pathCounts.sort(byCount)

  log(`${pathCounts.length} unique paths`)
  if (pathCounts.length > MAX_TRANSITIVE_PATHS) {
    log(`eliminated ${pathCounts.length - MAX_TRANSITIVE_PATHS} paths with frequency <= ${pathCounts[MAX_TRANSITIVE_PATHS].count} / ${paths.length} `)
  }

  let allStopPatternStopSets = pathCounts
    .slice(0, MAX_TRANSITIVE_PATHS)
    .map((p) => p.path)
    .filter(uniquePathIds) // uniquify the paths
    .map((p) => getStopPatternStopSets({log, pathDescriptor: p, origin}))

  const inPathCount = allStopPatternStopSets.length

  // Sort paths by the sequence of routes they use, and choose an example,
  // eliminating the multiple-board/transfer-stops problem
  allStopPatternStopSets.sort((p1, p2) => {
    if (p1.length < p2.length) return -1
    else if (p1.length > p2.length) return 1
    else {
      for (let i = 0; i < p1.length; i++) {
        const r1 = getRouteIndexFromPatternId(p1[i][1])
        const r2 = getRouteIndexFromPatternId(p2[i][1])
        if (r1 < r2) return -1
        if (r1 > r2) return 1
      }

      // identical patterns
      return 0
    }
  })

  allStopPatternStopSets = allStopPatternStopSets.filter((p, i, a) => {
    if (i === 0) return true
    const prev = a[i - 1]
    if (p.length !== prev.length) return true

    for (let s = 0; s < p.length; s++) {
      const r1 = getRouteIndexFromPatternId(p[s][1])
      const r2 = getRouteIndexFromPatternId(prev[s][1])
      if (r1 !== r2) {
        return true
      }
    }

    return false
  })

  const pathCountAfterMultiTransfer = allStopPatternStopSets.length

  // eliminate longer paths if there is a shorter path that is a subset
  // (eliminate the short access/egress/transfer leg problem)
  allStopPatternStopSets = allStopPatternStopSets.filter((path, i, rest) => {
    for (const otherPath of rest) {
      // longer paths cannot be subsets. Also don't evaluate the same path.
      if (otherPath.length >= path.length) continue

      let otherPathIsSubset = true
      const routes = path.map(seg => getRouteIndexFromPatternId(seg[1]))

      for (const seg of otherPath) {
        if (routes.indexOf(getRouteIndexFromPatternId(seg[1])) === -1) {
          otherPathIsSubset = false
          break
        }
      }

      if (otherPathIsSubset) {
        return false
      }
    }

    return true
  })

  log(`filtering reduced ${inPathCount} paths to ${pathCountAfterMultiTransfer} after multiple-stop elimination, to ${allStopPatternStopSets.length} after stemming`)

  return allStopPatternStopSets
}

/**
 * Bundle similar journeys in transitive data together. Works by computing a
 * score for each segment based on where the endpoints are relative to each
 * other. It might also make sense to use a metric based on speed so that a very
 * slow bus isn't bundled with a fast train, but we don't currently do this.
 */
function clusterJourneys ({
  journeys,
  log,
  patterns,
  stops
}: {
  journeys: Array<Journey>,
  log: Function,
  patterns: Array<Pattern>,
  stops: Array<Stop>
}) {
  // perform hierarchical clustering on journeys
  // see e.g. James et al., _An Introduction to Statistical Learning, with Applications in R_. New York: Springer, 2013, pg. 395.
  // convert to arrays
  const clusters = journeys.map((j) => [j])
  const inputSize = journeys.length

  // prevent infinite loop, makes sense only to loop until there's just one cluster left
  while (clusters.length > 1) {
    // find the minimum dissimilarity
    let minDis = Infinity
    let minI = 0
    let minJ = 0

    for (let i = 1; i < clusters.length; i++) {
      for (let j = 0; j < i; j++) {
        const d = getClusterDissimilarity(clusters[i], clusters[j], {patterns, stops})

        if (d < minDis) {
          minDis = d
          minI = i
          minJ = j
        }
      }
    }

    log(`dissimilarity ${minDis}`)
    if (minDis > MAX_DISSIMILARITY) break

    // cluster the least dissimilar clusters
    clusters[minI] = clusters[minI].concat(clusters[minJ])
    clusters.splice(minJ, 1) // remove clusters[j]
  }

  log(`replaced ${inputSize} journeys with ${clusters.length} clusters`)
  // merge journeys together
  return clusters.map((c) => {
    return c.reduce((j1, j2) => {
      for (let i = 0; i < j1.segments.length; i++) {
        if (j1.segments[i].type !== 'TRANSIT') continue

        // convert to pattern groups
        if (!j1.segments[i].patterns) {
          j1.segments[i].patterns = [{...j1.segments[i]}]
          j1.segments[i].pattern_id =
            j1.segments[i].from_stop_index =
            j1.segments[i].to_stop_index =
            undefined
        }

        // don't modify from and to indices, Transitive will use the stops from the first pattern
        // TODO replace with "places" (e.g. "Farragut Square Area")
        j1.segments[i].patterns.push({...j2.segments[i]})
      }

      return j1
    })
  })
}

/**
 * Get the dissimilarity between two clusters, using complete linkages (see
 * James et al., _An Introduction to Statistical Learning, with Applications in
 * R_. New York: Springer, 2013, pg. 395.)
 */
function getClusterDissimilarity (c1: Array<Journey>, c2: Array<Journey>, {
  patterns,
  stops
}: {
  patterns: Array<Pattern>,
  stops: Array<Stop>
}): number {
  let dissimilarity = 0

  for (const j1 of c1) {
    for (const j2 of c2) {
      // if they are not the same length, don't cluster them
      if (j1.segments.length !== j2.segments.length) return Infinity

      // otherwise compute maximum dissimilarity of stops at either start or end
      for (let segment = 0; segment < j1.segments.length; segment++) {
        const s1 = j1.segments[segment]
        const s2 = j2.segments[segment]

        // if one has a walk segment where the other has a transit segment these
        // are not comparable
        if (s1.type !== s2.type) return Infinity

        // Only cluster  on the stop positions which we get from transit segments
        if (s1.type !== 'WALK') {
          dissimilarity = Math.max(
            dissimilarity,
            segmentDissimilarity(s1, s2, {patterns, stops})
          )

          // no point in continuing, these won't be merged
          if (dissimilarity > MAX_DISSIMILARITY) return Infinity
        }
      }
    }
  }

  return dissimilarity
}

/** return the dissimilarity between two individual transit segments (each with only a single pattern, not yet merged) */
function segmentDissimilarity (s1: Segment, s2: Segment, {
  patterns,
  stops
}: {
  patterns: Array<Pattern>,
  stops: Array<Stop>
}): number {
  const pat1 = patterns.find((p) => p.pattern_id === s1.pattern_id)
  const pat2 = patterns.find((p) => p.pattern_id === s2.pattern_id)

  if (!pat1 || !pat2) return Infinity

  const s1f = s1.from_stop_index
  const s1t = s1.to_stop_index
  const s2f = s2.from_stop_index
  const s2t = s2.to_stop_index

  if (s1f == null || s1t == null || s2f == null || s2t == null) return Infinity

  function findStop (id: number): ?Stop {
    return stops.find((stop) => stop.stop_id === String(id))
  }

  const from1 = findStop(pat1.stops[s1f].stop_id)
  const to1 = findStop(pat1.stops[s1t].stop_id)
  const from2 = findStop(pat2.stops[s2f].stop_id)
  const to2 = findStop(pat2.stops[s2t].stop_id)

  if (!from1 || !from2 || !to1 || !to2) return Infinity

  const d1 = stopDistance(from1, from2)
  const d2 = stopDistance(to1, to2)
  return Math.max(d1, d2)
}

/** return the Ersatz (squared) distance between two stops, in undefined units */
function stopDistance (s1: Stop, s2: Stop): number {
  const cosLat = Math.cos(s1.stop_lat * Math.PI / 180)
  return Math.pow(s1.stop_lat - s2.stop_lat, 2) + Math.pow(s1.stop_lon * cosLat - s2.stop_lon * cosLat, 2)
}
