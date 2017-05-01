// @flow
import type {ImageData} from './types'

/**
 * Fill ImageData object to be used on Canvas. colorScheme is a function that
 * takes a number of minutes and returns an rgba array of the color for that
 * pixel.
 */
export default function isochroneTile (imageData: ImageData, {
  colorScheme,
  height,
  scaleFactor,
  surface,
  width,
  xoffset,
  yoffset
}: {
  colorScheme: (number) => Uint8Array,
  height: number,
  scaleFactor: number,
  surface: Uint8Array,
  width: number,
  xoffset: number,
  yoffset: number
}): ImageData {
  // compiler should avoid overflow checks for xp and yp because of the < 256
  // condition, but prevent it from checking for pixel overflow with | 0
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
