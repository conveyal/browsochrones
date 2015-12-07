/**
 * Fill ImageData object to be used on Canvas.
 * colorScheme is a function that takes a number of minutes and returns an rgba array of the color for that pixel
 */

import Color from 'color'

export default function isochroneTile (imageData, {height, scaleFactor, surface, width, xoffset, yoffset, colorScheme}) {
  // compiler should avoid overflow checks for xp and yp because of the < 256 condition, but prevent it from checking for pixel overflow with | 0
  for (let yp = 0, pixel = 0; yp < imageData.height; yp++) {
    for (let xp = 0; xp < imageData.width; xp++, pixel = (pixel + 1) | 0) {
      // figure out where xp and yp fall on the surface
      let xpsurf = (xp / scaleFactor + xoffset) | 0
      let ypsurf = (yp / scaleFactor + yoffset) | 0

      let val
      if (xpsurf < 0 || xpsurf > width || ypsurf < 0 || ypsurf > height) {
        val = 255
      } else {
        val = surface[ypsurf * width + xpsurf]
      }

      let colorScheme = colorScheme || function (val) {
        if (val === 255) return [0, 0, 0, 0] // fully transparent

        val = Math.min(val, 120)

        // 15 minutes of travel time represents 45 degrees on the color wheel
        let color = Color().hsl(0, 1, 70)
        color.rotate(45 * (val / 15 | 0))

        // saturation represents gradation within a 15-minute period
        color.saturation((val % 15 + 5) / 20 * 100)
        color.lightness(100 - (val % 15 + 5) / 20 * 100)


        return [color.red(), color.green(), color.blue(), 100]
      }

      let col = colorScheme(val)
      // 50% transparent yellow (#ddddaa)
      imageData.data[pixel * 4] = col[0]
      imageData.data[pixel * 4 + 1] = col[1]
      imageData.data[pixel * 4 + 2] = col[2]
      imageData.data[pixel * 4 + 3] = col[3]
    }
  }

  return imageData
}
