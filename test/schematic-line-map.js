/** A simple schematic map of all of the trips in a Transitive.js dataset */

import dbg from 'debug'
import React, {Component, PropTypes} from 'react'

const debug = dbg('browsochrones:schematic-line-map')

// vertical schematic
const WIDTH = 220
const HEIGHT = 600

class SchematicLineMap extends Component {
  static propTypes = {
    /** Transitive data object */
    data: PropTypes.object
  }

  render () {
    let { routes, patterns, journeys } = this.props.data

    // figure out what stops are used in each pattern
    // note that these are the stop position _in the pattern_, not in graph
    // also index transfers from each pattern, used when optimizing position
    let usedStopsPerPattern = new Map()
    let transfersFromPattern = new Map()

    journeys.forEach(function (j) {
      j.segments.filter(s => s.type === 'TRANSIT').forEach((s, i, a) => {
        let patId = s.pattern_id != null ? s.pattern_id : s.patterns[0].pattern_id
        let fromStop = s.pattern_id != null ? s.from_stop_index : s.patterns[0].from_stop_index
        let toStop = s.pattern_id != null ? s.to_stop_index : s.patterns[0].to_stop_index

        if (!usedStopsPerPattern.has(patId)) usedStopsPerPattern.set(patId, new Set())

        usedStopsPerPattern.get(patId).add(fromStop)
        usedStopsPerPattern.get(patId).add(toStop)

        if (i < a.length - 1) {
          if (!transfersFromPattern.has(patId)) transfersFromPattern.set(patId, [])

          let toPattern = a[i + 1].pattern_id ? a[i + 1].pattern_id : a[i + 1].patterns[0].pattern_id
          let transferStop = a[i + 1].pattern_id ? a[i + 1].from_stop_index : a[i + 1].patterns[0].from_stop_index

          transfersFromPattern.get(patId).push({ fromStop, toPattern, toStop: transferStop })
        }
      })
    })

    let nPatterns = usedStopsPerPattern.size
    debug(`${nPatterns} used in search`)

    // figure out where each pattern is horizontally
    let patternHorizOffsets = new Map()
    let patternVerticalOffsets = new Map()
    let minStopPerPattern = new Map()
    let maxStopPerPattern = new Map()

    let hoff = 0
    for (let p of usedStopsPerPattern.keys()) {
      patternHorizOffsets.set(p, hoff += WIDTH / (nPatterns + 1))
      patternVerticalOffsets.set(p, 0)

      let min = Infinity
      let max = -Infinity

      for (let t of usedStopsPerPattern.get(p).values()) {
        min = Math.min(min, t)
      }

      for (let t of usedStopsPerPattern.get(p).values()) {
        max = Math.max(max, t)
      }

      minStopPerPattern.set(p, min)
      maxStopPerPattern.set(p, max)
    }

    // now the hard part: figure out how many cells we need and where each pattern is vertically
    // we're trying to minimize the number of patterns that have transfers that go the wrong way in the plot
    let objective = this.calculateObjective(patternVerticalOffsets, minStopPerPattern, maxStopPerPattern, transfersFromPattern)
    for (let i = 0; ; i++) {
      // greedily attempt to improve
      let improved = false

      for (let pattern of patternVerticalOffsets.keys()) {
        let off = patternVerticalOffsets.get(pattern)
        patternVerticalOffsets.set(pattern, off + 1)
        let newObjective = this.calculateObjective(patternVerticalOffsets, minStopPerPattern, maxStopPerPattern, transfersFromPattern)

        if (newObjective < objective) {
          improved = true
          objective = newObjective
        } else {
          // restore it
          patternVerticalOffsets.set(pattern, off)
        }
      }

      if (i > 100) {
        debug('ending optimization after 100 iterations even though convergence has not been reached')
        break
      }

      if (!improved || objective === 0) break
    }

    // draw the plot
    let gridHeight = 0

    for (let [ pat, off ] of patternVerticalOffsets.entries()) {
      gridHeight = Math.max(gridHeight, off + maxStopPerPattern.get(pat) - minStopPerPattern.get(pat))
    }

    let cellHeight = HEIGHT / gridHeight

    let ret = []

    journeys.forEach(j => {
      j.segments.filter(s => s.type === 'TRANSIT')
        .forEach((s, i, a) => {
          let patId = s.pattern_id != null ? s.pattern_id : s.patterns[0].pattern_id
          let fromStop = s.pattern_id != null ? s.from_stop_index : s.patterns[0].from_stop_index
          let toStop = s.pattern_id != null ? s.to_stop_index : s.patterns[0].to_stop_index

          // draw the transfer if needed
          if (i > 0) {
            let prev = a[i - 1]
            let prevPatId = prev.pattern_id != null ? prev.pattern_id : prev.patterns[0].pattern_id
            let prevToStop = prev.pattern_id != null ? prev.to_stop_index : prev.patterns[0].to_stop_index

            ret.push(<line x1={patternHorizOffsets.get(prevPatId)}
              x2={patternHorizOffsets.get(patId)}
              y1={(patternVerticalOffsets.get(prevPatId) + prevToStop - minStopPerPattern.get(prevPatId)) * cellHeight}
              y2={(patternVerticalOffsets.get(patId) + fromStop - minStopPerPattern.get(patId)) * cellHeight}
              style={{stroke: '#faa'}}
              markerEnd='url(#arrow)' />
            )
          }

          let fromY = (patternVerticalOffsets.get(patId) + fromStop - minStopPerPattern.get(patId)) * cellHeight
          let toY = (patternVerticalOffsets.get(patId) + toStop - minStopPerPattern.get(patId)) * cellHeight
          let x = patternHorizOffsets.get(patId)

          ret.push(<line x2={x}
            x1={x}
            y2={fromY}
            y1={toY}
            style={{stroke: '#aaf'}} />
          )

          // if we're at the start of the trip add a marker for the origin
          if (i === 0) ret.push(<circle cx={x} cy={fromY} r={5} style={{stroke: '#000', fill: '#fff'}} />)
          if (i === a.length - 1) ret.push(<circle cx={x} cy={toY} r={5} style={{stroke: '#000', fill: '#000'}} />)

          // add a label
          let routeId = patterns.filter(p => p.pattern_id === (s.pattern_id != null ? s.pattern_id : s.patterns[0].pattern_id))[0].route_id
          let route = routes.filter(r => r.route_id === routeId)[0].route_short_name

          let y = Math.min((fromY + toY) / 2, fromY + 55)
          ret.push(
            <text x={x} y={y}
              style={{fontFamily: 'sans', fontSize: '9pt', fill: '#66f'}}
              transform={`rotate(90 ${x} ${y})`}>{route}
            </text>
          )
        })
    })

    return <svg style={{width: WIDTH + 'px', height: HEIGHT + 'px'}}>
      <defs>
        {/* "is" forces react to pass all attrs through untouched: https://github.com/facebook/react/issues/140#issuecomment-114290163 */}
        <marker is id='arrow' markerwidth={10} markerheight={6} orient='auto' refX='10' refY='3'>
          <path d='M0,0 L10,3 L0,6 L0,0' style={{fill: '#000'}} />
        </marker>
      </defs>
      {ret}
    </svg>
  }

  /** Calculate how many transfers go the wrong way. We try to minimize this. */
  calculateObjective (patternVerticalOffsets, minStopPerPattern, maxStopPerPattern, transfersFromPattern) {
    let objective = 0
    for (let pattern of patternVerticalOffsets.keys()) {
      if (!transfersFromPattern.has(pattern)) continue

      let txx = transfersFromPattern.get(pattern)
      txx.forEach(transfer => {
        let from = transfer.fromStop - minStopPerPattern.get(pattern) + patternVerticalOffsets.get(pattern)
        let to = transfer.toStop - minStopPerPattern.get(transfer.toPattern) + patternVerticalOffsets.get(transfer.toPattern)

        // this transfer goes the wrong way
        if (to <= from) objective += from - to + 1
      })
    }

    return objective
  }
}

export default SchematicLineMap
