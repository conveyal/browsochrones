// @flow
import {hsl, rgb} from 'd3-color'
import slice from 'lodash/slice'

import type {Origin, Point} from './types'

/**
 * Get a non transit time in minutes, or 255 if you cannot walk to this pixel
 */
export function getNonTransitTime (origin: Origin, to: Point): number {
  let relx = to.x - origin.x
  let rely = to.y - origin.y

  if (Math.abs(relx) <= origin.radius && Math.abs(rely) <= origin.radius) {
    // make them nonnegative so they can be used as offsets
    relx += origin.radius
    rely += origin.radius

    // we can possibly walk to this pixel
    // the index of the pixel, plus one because the radius is recorded at the start of the array
    const timeSecs = origin.data[rely * (origin.radius * 2 + 1) + relx + 1]
    const timeMins = timeSecs / 60 | 0
    if (timeSecs !== -1 && timeMins < 255) return timeMins
  }

  return 255
}

const colorTable = new Uint8Array(255 * 4)

for (let i = 0; i < 254; i++) {
  const val = Math.min(i, 120)
  const hue = 45 * (val / 15 | 0) // 15 minutes of travel time represents 45 degrees on the color wheel
  const saturation = (val % 15 + 5) / 20 // saturation represents gradation within a 15-minute period
  const luminosity = (val % 15 + 5) / 20
  const color = rgb(hsl(hue, saturation, luminosity))

  colorTable[val * 4] = color.r
  colorTable[val * 4 + 1] = color.g
  colorTable[val * 4 + 2] = color.b
  colorTable[val * 4 + 3] = 100
}

export function colorScheme (val: number): Uint8Array {
  return slice(colorTable, val * 4, val * 4 + 4)
}
