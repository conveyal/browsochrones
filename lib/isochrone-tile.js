/**
 * Fill ImageData object to be used on Canvas.
 * colorScheme is a function that takes a number of minutes and returns an rgba array of the color for that pixel
 */

import {hsl, rgb} from 'd3-color'
import slice from 'lodash/slice'

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

function defaultColorScheme (val) {
  return slice(colorTable, val * 4, val * 4 + 4)
}

// 255 is preinitialized to 0, 0, 0, 0

export default function isochroneTile (imageData, {
  colorScheme = defaultColorScheme,
  height,
  scaleFactor,
  surface,
  width,
  xoffset,
  yoffset
}) {
  // compiler should avoid overflow checks for xp and yp because of the < 256 condition, but prevent it from checking for pixel overflow with | 0
  for (let yp = 0, pixel = 0; yp < imageData.height; yp++) {
    for (let xp = 0; xp < imageData.width; xp++, pixel = (pixel + 1) | 0) {
      // figure out where xp and yp fall on the surface
      const xpsurf = (xp / scaleFactor + xoffset) | 0
      const ypsurf = (yp / scaleFactor + yoffset) | 0

      let val
      if (xpsurf < 0 || xpsurf > width || ypsurf < 0 || ypsurf > height) {
        val = 255
      } else {
        val = surface[ypsurf * width + xpsurf]
      }

      const col = colorScheme(val)
      // 50% transparent yellow (#ddddaa)
      imageData.data[pixel * 4] = col[0]
      imageData.data[pixel * 4 + 1] = col[1]
      imageData.data[pixel * 4 + 2] = col[2]
      imageData.data[pixel * 4 + 3] = col[3]
    }
  }

  return imageData
}
