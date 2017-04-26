// @flow
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
}: {
  cutoff: number,
  height: number,
  interpolation: boolean,
  north: number,
  surface: Uint8Array,
  west: number,
  width: number,
  zoom: number
}): any {
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
