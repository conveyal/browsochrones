/** Create transitive data for journeys from a particular origin to a particular destination */

import Color from 'color'
import dbg from 'debug'
import fill from 'lodash.fill'
import slice from 'lodash.slice'

import {pixelToLat, pixelToLon} from './mercator'
import {getNonTransitTime} from './origin'

const debug = dbg('browsochrones:get-transitive-data')

// maximum path segments before we conclude that either R5 or Browsochrones is off its rocker and bail
// (we do this so that we don't generate and attempt to render crazy paths; it implies a bug but it's better to log
//  an erro message than crash the user's browser)
const MAX_PATH_SEGMENTS = 8

// arbitrary value that determines how aggressively to cluster results (higher is more aggressive, and a high number is something like 1e-3)
const MAXIMUM_DISSIMILARITY = 5e-5

export default function getTransitiveData ({origin, query, stopTreeCache, network, to}) {
  // create the journeys
  let output = {
    places: [],
    journeys: []
  }

  output.places.push({
    place_id: 'from',
    place_name: 'Origin', // todo do this with icons, avoid English works (or Portuguese words, for that matter)
    place_lat: pixelToLat(query.north + origin.y, query.zoom),
    place_lon: pixelToLon(query.west + origin.x, query.zoom)
  })

  output.places.push({
    place_id: 'to',
    place_name: to.name || 'Destination',
    place_lat: pixelToLat(query.north + to.y, query.zoom),
    place_lon: pixelToLon(query.west + to.x, query.zoom)
  })

  // find relevant paths at each minute
  // this array stores the destination stop and the path index in that stop
  let { paths } = getPaths({origin, query, stopTreeCache, to})

  paths = paths.filter(p => p !== undefined)

  paths.sort((p1, p2) => {
    let v0 = p1[0] - p2[0] // sort first by stop ID
    if (v0 !== 0) return v0
    else return p1[1] - p2[1] // then by path index
  })

  let npaths = paths.length

  // get (up to) five most common paths
  paths = paths.reduce((out, path, index) => {
    if (index === 0) out.unshift({ count: 1, path })
    else if (out[0].path[0] === path[0] && out[0].path[1] === path[1]) out[0].count++
    else out.unshift({ count: 1, path })
    return out
  }, [])

  // sort by frequency
  paths.sort((p1, p2) => p2.count - p1.count)

  debug(`${paths.length} unique paths`)

  if (paths.length > 5) {
    debug(`eliminated ${paths.length - 5} paths with frequency less than or equal to ${paths[5].count} / ${npaths} `)
  }

  paths = paths.slice(0, 5).map(p => p.path)

  // uniquify the paths
  // always return first path, and don't return paths the same as the previous
  paths = paths.filter((p, idx, arr) => idx === 0 || p[0] !== arr[idx - 1][0] || p[1] !== arr[idx - 1][1]).map(p => getPath({pathDescriptor: p, origin}))

  paths = filterPaths(paths, network)

  for (let pidx = 0; pidx < paths.length; pidx++) {
    let journey = {
      journey_id: pidx,
      journey_name: pidx,
      segments: []
    }

    let path = paths[pidx]

    // bail if the path-finding algorithm gave up, this is a bug but we'd rather log a javascript error than crash the tab
    if (path === null) continue

    if (path.length > 20) {
      debug('excessive path length, more than 20 segments')
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
      let originStop = path[0][0]
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
        let [boardStop, pattern, alightStop] = path[segmentIdx]

        // figure out from and to stop indices
        let fromStopId = boardStop + ''
        let toStopId = alightStop + ''

        let index = 0
        let patternData = network.patterns[pattern + '']

        while (patternData.stops[index].stop_id !== fromStopId) index++
        let fromStopIdx = index
        while (patternData.stops[index].stop_id !== toStopId) index++
        let toStopIdx = index

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

    output.journeys.push(journey)
  }

  // target is output so as not to modify network object
  Object.assign(output, network)

  //bundle(output)

  return output
}

/** get an array of [stop, path] for each departure minute */
export function getPaths ({origin, to, stopTreeCache, query}) {
  const paths = new Array(origin.nMinutes)
  const times = new Uint8Array(origin.nMinutes)
  // fill with non transit time, so we don't include suboptimal transit trips
  const nonTransitTime = getNonTransitTime(origin, to)
  fill(times, nonTransitTime)

  // if non-transit-times is less than 255, we can just walk here, so preinitialize the paths with a placeholder for walking all
  // the way
  if (nonTransitTime < 255) fill(paths, [-1, -1])

  to.y |= 0
  to.x |= 0

  // we're outside the query, bail
  if (to.x >= query.width || to.x < 0 || to.y >= query.height || to.y < 0) return { paths, times }

  let stcOffset = stopTreeCache.index[to.y * query.width + to.x]
  const reachableStops = stopTreeCache.data[stcOffset++]

  for (let stopIdx = 0; stopIdx < reachableStops; stopIdx++) {
    const stopId = stopTreeCache.data[stcOffset++]
    const accessTime = stopTreeCache.data[stcOffset++]
    const originOffset = origin.index[stopId]

    // minute, stopTime and pathIdx are delta-coded _per stop_
    for (let minute = 0, stopTime = 0, pathIdx = 0; minute < origin.nMinutes; minute++) {
      stopTime = origin.data[originOffset + minute * 2]
      pathIdx = origin.data[originOffset + minute * 2 + 1]

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

  return { paths, times }
}

/** get path from [stop, path index], return array of [
  [from stop ID, pattern, to stop ID],
  [from stop ID, pattern, to stop ID],
  ...
] */
export function getPath ({pathDescriptor, origin}) {
  const [ stop, pathIdx ] = pathDescriptor
  if (stop === -1) return []
  // offset to the first path, skipping times and nPaths
  let offset = origin.index[stop] + origin.nMinutes * 2 + 1

  // seek forward to correct path
  let curIdx = 0
  while (curIdx++ < pathIdx) {
    const nSegments = origin.data[offset++]
    offset += nSegments * 3
  }

  const nSegments = origin.data[offset++]

  if (nSegments > MAX_PATH_SEGMENTS) {
    // bail if we have a ridiculous path (clearly a data/code error), and complain loudly
    debug(`Too many path segments (${nSegments} > ${MAX_PATH_SEGMENTS}) in path ${pathIdx} to stop ${stop} from origin ${origin.x}, ${origin.y}, returning no path. This implies a bug, please raise cain about it`)
    return null
  }

  const path = []
  for (let seg = 0; seg < nSegments; seg++) {
    // not delta coded
    // todo this is creating typed arrays which may be inefficient for such small values
    path.push(slice(origin.data, offset, offset + 3))
    offset += 3
  }

  return path
}

/** Perform heuristic filtering on paths. How does it work? Magic. */
export function filterPaths (paths, network) {
  let inPathCount = paths.length

  // function to convert pattern ID to route ID
  let r = (pattern) => {
    let pat = network.patterns.find(p => p.pattern_id === String(pattern))
    return network.routes.findIndex(r => r.route_id === pat.route_id)
  }

  // for now this is pretty simple, sort paths by the sequence of routes they use, and choose an example, eliminating the multiple-board/transfer-stops problem
  paths.sort((p1, p2) => {
    if (p1.length < p2.length) return -1
    else if (p1.length > p2.length) return 1
    else {
      for (let i = 0; i < p1.length; i++) {
        let r1 = r(p1[i][1])
        let r2 = r(p2[i][1])
        if (r1 < r2) return -1
        if (r1 > r2) return 1
      }

      // identical patterns
      return 0
    }
  })

  paths = paths.filter((p, i, a) => {
    if (i === 0) return true
    let prev = a[i - 1]
    if (p.length !== prev.length) return true

    for (let s = 0; s < p.length; s++) {
      if (r(p[s][1]) !== r(prev[s][1])) return true
    }

    return false
  })

  let pathCountAfterMultiTransfer = paths.length

  // eliminate longer paths if there is a shorter path that is a subset (eliminate the short access/egress/transfer leg problem)
  paths = paths.filter((path, i, a) => {
    for (let otherPath of paths) {
      if (otherPath.length >= path.length) continue // longer paths cannot be subsets. Also don't evaluate the same path.

      let otherPathIsSubset = true
      let routes = path.map(seg => r(seg[1]))

      for (let seg of otherPath) {
        if (routes.indexOf(r(seg[1])) === -1) {
          otherPathIsSubset = false
          break
        }
      }

      if (otherPathIsSubset) {
        console.log(`path ${otherPath.map(seg => r(seg[1]))} is subset of path ${routes}`)
        return false
      }
    }

    return true
  })

  console.log(`filtering reduced ${inPathCount} paths to ${pathCountAfterMultiTransfer} after multiple-stop elimination, to ${paths.length} after stemming`)

  return paths
}

/**
 * bundle similar journeys in transitive data together.
 * Works by computing a score for each segment based on where the endpoints are relative to each other.
 * It might also make sense to use a metric based on speed so that a very slow bus isn't bundled with a fast train,
 * but we don't currently do this.
 */
export function bundle (data) {
  // perform hierarchical clustering on journeys
  // see e.g. James et al., _An Introduction to Statistical Learning, with Applications in R_. New York: Springer, 2013, pg. 395.
  // convert to arrays
  let clusters = data.journeys.map(j => [j])
  let inputSize = data.journeys.length

  // prevent infinite loop, makes sense only to loop until there's just one cluster left
  while (clusters.length > 1) {
    // find the minimum dissimilarity
    let minDis = Infinity
    let minI
    let minJ

    for (let i = 1; i < clusters.length; i++) {
      for (let j = 0; j < i; j++) {
        let d = clusterDissimilarity(clusters[i], clusters[j], data)

        if (d < minDis) {
          minDis = d
          minI = i
          minJ = j
        }
      }
    }

    debug(`dissimilarity ${minDis}`)

    // should we make a cluster?
    if (minDis > MAXIMUM_DISSIMILARITY) break

    // cluster the least dissimilar clusters
    clusters[minI] = clusters[minI].concat(clusters[minJ])
    clusters.splice(minJ, 1) // remove clusters[j]
  }

  // merge journeys together
  /*data.journeys = clusters.map(c => {
    return c.reduce((j1, j2) => {
      for (let i = 0; i < j1.segments.length; i++) {
        if (j1.segments[i].type !== 'TRANSIT') continue

        // convert to pattern groups
        if (!j1.segments[i].patternGroup) {
          j1.segments[i].patternGroup = [j1.segments[i].pattern_id]
          j1.segments[i].pattern_id = undefined
        }

        // don't modify from and to indices, Transitive will use the stops from the first pattern
        // TODO replace with "places" (e.g. "Farragut Square Area")
        j1.segments[i].patternGroup.push(j2.segments[i].pattern_id)
      }

      return j1
    })
  })*/

  // for now just return the first journey
  data.journeys = clusters.map(c => c[0])

  // color routes according to cluster
  let col = Color('#b00')
  clusters.forEach(c => {
    col.rotate(67)
    c.forEach(j => {
      j.segments.forEach(s => {
        s.color = col.hexString()
      })
    })
  })

  debug(`replaced ${inputSize} journeys with ${clusters.length} clusters`)
}

/**
 * return the dissimilarity between two clusters, using complete linkages
 * (see James et al., _An Introduction to Statistical Learning, with Applications in R_. New York: Springer, 2013, pg. 395.)
 */
function clusterDissimilarity (c1, c2, data) {
  let ret = 0

  for (let j1 of c1) {
    for (let j2 of c2) {
      // if they are not the same length, don't cluster them
      if (j1.segments.length !== j2.segments.length) return Infinity

      // otherwise compute maximum dissimilarity of stops at either start or end
      for (let segment = 0; segment < j1.segments.length; segment++) {
        let s1 = j1.segments[segment]
        let s2 = j2.segments[segment]

        // if one has a walk segment where the other has a transit segment, that's a problem
        // and these are not comparable
        if (s1.type !== s2.type) return Infinity

        // Don't look at walk segments, we only cluster based on the stop positions which we get from transit segments
        if (s1.type === 'WALK') continue

        ret = Math.max(ret, segmentDissimilarity(s1, s2, data))

        // no point in continuing, these won't be merged
        if (ret > MAXIMUM_DISSIMILARITY) return Infinity
      }
    }
  }

  return ret
}

/** return the dissimilarity between two individual transit segments (each with only a single pattern, not yet merged) */
function segmentDissimilarity (s1, s2, data) {
  let pat1 = data.patterns.find(p => p.pattern_id === s1.pattern_id)
  let pat2 = data.patterns.find(p => p.pattern_id === s2.pattern_id)

  let from1 = pat1.stops[s1.from_stop_index].stop_id
  let to1 = pat1.stops[s1.to_stop_index].stop_id
  let from2 = pat2.stops[s2.from_stop_index].stop_id
  let to2 = pat2.stops[s2.to_stop_index].stop_id

  let d1 = stopDistance(from1, from2, data)
  let d2 = stopDistance(to1, to2, data)
  return Math.max(d1, d2)
}

/** return the Ersatz (squared) distance between two stops, in undefined units */
function stopDistance (stop1, stop2, data) {
  // TODO perhaps this should be optimized?
  let s1 = data.stops.find(s => s.stop_id === stop1 + '')
  let s2 = data.stops.find(s => s.stop_id === stop2 + '')

  let cosLat = Math.cos(s1.stop_lat * Math.PI / 180)
  return Math.pow(s1.stop_lat - s2.stop_lat, 2) + Math.pow(s1.stop_lon * cosLat - s2.stop_lon * cosLat, 2)
}
