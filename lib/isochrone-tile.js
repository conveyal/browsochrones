
/**
 * Fill ImageData object to be used on Canvas.
 */

export default function isochroneTile (imageData, {cutoffMinutes, height, scaleFactor, surface, width, xoffset, yoffset}) {
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

      if (val <= cutoffMinutes) {
        // 50% transparent yellow (#ddddaa)
        imageData.data[pixel * 4] = 0xdd
        imageData.data[pixel * 4 + 1] = 0xdd
        imageData.data[pixel * 4 + 2] = 0xaa
        imageData.data[pixel * 4 + 3] = 220
      } else {
        // fully transparent
        imageData.data[pixel * 4 + 3] = 0
      }
    }
  }

  return imageData
}
