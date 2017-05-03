// @flow
import getPathsAndTimes from './get-paths-and-times'
import getTransitiveData from './get-transitive-data'

import type {Origin, Point, Query, StopTreeCache, TransitiveData} from './types'

export default function generateDestinationData ({
  from,
  inVehicleTravelTimes,
  log = console.log.bind(console),
  origin,
  query,
  stopTreeCache,
  surface,
  to,
  transitiveNetwork,
  waitTimes,
  walkTimes
}: {
  from: Point,
  inVehicleTravelTimes: Uint8Array,
  log: Function,
  origin: Origin,
  query: Query,
  stopTreeCache: StopTreeCache,
  surface: Uint8Array,
  to: Point,
  transitiveNetwork: TransitiveData,
  waitTimes: Uint8Array,
  walkTimes: Uint8Array
}) {
  const {paths, times} = getPathsAndTimes({
    origin,
    query,
    stopTreeCache,
    to
  })

  // NB separate walk time because some summary statistics don't preserve
  // stat(wait) + stat(walk) + stat(inVehicle) = stat(total)
  const index = to.y * query.width + to.x
  return {
    paths,
    times,
    transitive: getTransitiveData({
      from,
      log,
      origin,
      paths: paths.slice(),
      query,
      to,
      transitiveNetwork
    }),
    travelTime: surface[index],
    waitTime: waitTimes[index],
    inVehicleTravelTime: inVehicleTravelTimes[index],
    walkTime: walkTimes[index]
  }
}
