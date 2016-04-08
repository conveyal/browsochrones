/**
 * Visualize a contour grid
 */

import React, {Component, PropTypes} from 'react'

const WIDTH = 1200
const HEIGHT = 900

// cases in hexadecimal so it's a single character
const HEX = '0123456789ABCDEF'

// elements for various cases, unit scale
const EDGE = { fill: '#f00' }
const CENTER = { fill: '#000' }
const SVG_ELEMENTS = {
  0: <circle cx='0.5' cy='0.5' r='0.1' style={CENTER} />,
  1: <path d='M 0 0.5 L 0.5 1 L 0 1 Z' style={EDGE} />,
  2: <path d='M 1 0.5 L 0.5 1 L 1 1 Z' style={EDGE} />,
  3: <path d='M 0 0.5 L 1 0.5 L 1 1 L 0 1 Z' style={EDGE} />,
  4: <path d='M 0.5 0 L 1 0.5 L 1 0 Z' style={EDGE} />,
  5: <path d='M 0 0.5 L 0.5 0 L 1 0 L 1 0.5 L 0.5 1 L 0 1 Z' style={EDGE} />,
  6: <path d='M 0.5 0 L 0.5 1 L 1 1 L 1 0 Z' style={EDGE} />,
  7: <path d='M 0.5 0 L 1 0 L 1 1 L 0 1 L 0 0.5 Z' style={EDGE} />,
  8: <path d='M 0 0 L 0.5 0 L 0 0.5 Z' style={EDGE} />,
  9: <path d='M 0.5 0 L 0.5 1 L 0 1 L 0 0 Z' style={EDGE} />,
  10: <path d='M 0.5 0 L 1 0.5 L 1 1 L 0.5 1 L 0 0.5 L 0 0 Z' style={EDGE} />,
  11: <path d='M 0.5 0 L 1 0.5 L 1 1 L 0 1 L 0 0 Z' style={EDGE} />,
  12: <path d='M 0 0.5 L 1 0.5 L 1 0 L 0 0 Z' style={EDGE} />,
  13: <path d='M 0.5 1 L 1 0.5 L 1 0 L 0 0 L 0 1 Z' style={EDGE} />,
  14: <path d='M 0 0.5 L 0.5 1 L 1 1 L 1 0 L 0 0 Z' style={EDGE} />,
  15: <path d='M 0 0 L 0 1 L 1 1 L 1 0 Z' style={CENTER} />
}

class ContourGrid extends Component {
  static propTypes = {
    contour: PropTypes.object.isRequired,
    query: PropTypes.object.isRequired,
    west: PropTypes.number.isRequired,
    north: PropTypes.number.isRequired,
    width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired
  }

  render () {
    let elements = []

    let { north, west } = this.props

    // contour grid is one pixel smaller in each dimension
    let contourWidth = this.props.width - 1
    let contourHeight = this.props.height - 1
    let cellWidth = WIDTH / contourWidth
    let cellHeight = HEIGHT / contourHeight

    // the width of the full contour grid, not our subset
    let fullContourWidth = this.props.query.width - 1

    for (let y = north; y < north + contourHeight; y++) {
      for (let x = west; x < west + contourWidth; x++) {
        let pixel = y * fullContourWidth + x
        let idx = this.props.contour[pixel]

        elements.push(
          <g transform={`scale(${cellWidth} ${cellHeight}) translate(${x - west} ${y - north})`} key={pixel}>
            {SVG_ELEMENTS[idx]}
            <text style={{fontSize: '1px', fill: '#00f'}} transform='translate(0.25 0.5)'>{idx > 0 && idx < 15 ? HEX[idx] : ''}</text>
          </g>
        )
      }
    }

    return <svg width={WIDTH} height={HEIGHT}>{elements}</svg>
  }
}

export default ContourGrid
