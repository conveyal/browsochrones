/** Create transitive data for journeys from a particular origin to a particular destination */

import { pixelToLat, pixelToLon } from './mercator'

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
  let paths = new Array(origin.nMinutes)
  let times = new Uint8Array(origin.nMinutes)
  // fill with non transit time, so we don't include suboptimal transit trips
  let nonTransitTime = origin.getNonTransitTime(to.x, to.y)
  times.fill(nonTransitTime)

  // if non-transit-times is less than 255, we can just walk here, so preinitialize the paths with a placeholder for walking all
  // the way
  if (nonTransitTime < 255) paths.fill([-1, -1])

  to.y |= 0
  to.x |= 0

  let stcOffset = stopTreeCache.index[to.y * query.width + to.x]
  let reachableStops = stopTreeCache.data[stcOffset++]

  for (let stopIdx = 0; stopIdx < reachableStops; stopIdx++) {
    let stopId = stopTreeCache.data[stcOffset++]
    let accessTime = stopTreeCache.data[stcOffset++]
    let originOffset = origin.index[stopId]

    // minute, stopTime and pathIdx are delta-coded _per stop_
    for (let minute = 0, stopTime = 0, pathIdx = 0; minute < origin.nMinutes; minute++) {
      stopTime += origin.data[originOffset + minute * 2]
      pathIdx += origin.data[originOffset + minute * 2 + 1]
      let time = stopTime / 60 + accessTime | 0

      if (time >= 255) continue
      if (time < times[minute]) {
        times[minute] = time
        paths[minute] = [stopId, pathIdx]
      }
    }
  }

  paths = paths.filter(p => p !== undefined)

  paths.sort((p1, p2) => {
    let v0 = p1[0] - p2[0] // sort first by stop ID
    if (v0 !== 0) return v0
    else return p1[1] - p2[1] // then by path index
  })

  // uniquify the paths
  // always return first path, and don't return paths the same as the previous
  paths = paths.filter((p, idx, arr) => idx === 0 || p[0] !== arr[idx - 1][0] || p[1] !== arr[idx - 1][1])

  for (let pidx = 0, stopId = -1, stopPathIdx = -1, offset; pidx < paths.length; pidx++) {
    let path = paths[pidx]

    let journey = {
      journey_id: pidx,
      journey_name: pidx,
      segments: []
    }

    if (path[0] === -1) {
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
      if (path[0] !== stopId) {
        stopId = path[0]
        stopPathIdx = -1
        offset = origin.index[stopId]
        // skip minutes, path indices, number of paths
        offset += origin.nMinutes * 2 + 1
      }

      // seek to appropriate path
      while (++stopPathIdx < path[1]) {
        let size = origin.data[offset++]
        // skip this path
        offset += size * 3
      }

      let pathLen = origin.data[offset++]

      if (pathLen === 0) {
        console.error(`Path ${path[1]} to stop ${path[0]} has no transit segment!`)
        continue
      }

      // add the first walk segment
      let originStop = origin.data[offset] // not incrementing offset, we'll need it shortly
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

      for (let segment = 0; segment < pathLen; segment++) {
        let boardStop = origin.data[offset++]
        let pattern = origin.data[offset++]
        let alightStop = origin.data[offset++]

        // figure out from and to stop indices
        let fromStopId = boardStop + ''
        let toStopId = alightStop + ''

        let index = 0
        let patternData = network.patterns[pattern + '']

        // second should be non-binding but prevent infinite loops
        while (patternData.stops[index].stop_id !== fromStopId && index < patternData.stops.length) index++
        let fromStopIdx = index
        while (patternData.stops[index].stop_id !== toStopId   && index < patternData.stops.length) index++
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

  return output
}
