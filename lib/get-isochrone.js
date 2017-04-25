import jsolines from 'jsolines'

import * as mercator from './mercator'

export default function getIsochrone ({
  cutoff = 60,
  height,
  interpolation = true,
  north,
  surface,
  west,
  width,
  zoom
}) {
  return jsolines({
    cutoff,
    height,
    interpolation,
    surface,
    width,
    // coords are at zoom level of query
    project: ([x, y]) => {
      return [
        mercator.pixelToLon(x + west, zoom),
        mercator.pixelToLat(y + north, zoom)
      ]
    }
  })
}
