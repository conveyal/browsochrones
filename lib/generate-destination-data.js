
import getPathsAndTimes from './get-paths-and-times'
import getTransitiveData from './get-transitive-data'

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
      stopTreeCache,
      to,
      transitiveNetwork
    }),
    travelTime: surface[index],
    waitTime: waitTimes[index],
    inVehicleTravelTime: inVehicleTravelTimes[index],
    walkTime: walkTimes[index]
  }
}
