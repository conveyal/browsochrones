/**
 * Render a Marey plot showing paths.
 * @author mattwigway, after E. J. Marey, 1885, and Ibry (neither of whom have github accounts I assume)
 */

import React, {Component, PropTypes} from 'react'
import {getPaths, getPath} from './get-transitive-data'
import Color from 'color'

const HEIGHT = 220

class Marey extends Component {
  static propTypes = {
    browsochrones: PropTypes.object.isRequired,
    dest: PropTypes.object.isRequired
  }

  render () {
    const WIDTH = window.innerWidth - 20

    // figure out how many unique stops there are in each round
    let stopsPerRound = []
    let bc = this.props.browsochrones
    let { paths, times } = getPaths({origin: bc.origin, to: this.props.dest, stopTreeCache: bc.stopTrees, query: bc.query})

    // they come out of r5 backwards
    times.reverse()
    paths.reverse()

    // clear the ones that are the same and arrive at the same time
    for (let p = 0; p < paths.length - 1; p++) {
      // + 1: time is offset one minute (wait one minute and take the trip at the next minute)
      if (times[p] === times[p + 1] + 1 && paths[p][0] === paths[p + 1][0] && paths[p][1] === paths[p + 1][1]) paths[p] = undefined
    }

    paths = paths.map(path => path === undefined ? undefined : getPath({ pathDescriptor: path, origin: bc.origin }))

    let pathSet = new Set(paths.filter(path => path !== undefined))

    // find the right-most time
    // in theory, this is just the last value of times plus the number of minutes, but we want to render
    // overtaking paths if they exist
    let maxTime = Array.prototype.map.call(times.filter(t => t !== 255), (t, i) => t + i).reduce((a, b) => Math.max(a, b))

    // initialize stopsPerRound
    // NB stopsPerRound does not have entries for the destination/final stop
    for (let path of pathSet.values()) {
      for (let round = 0; round < path.length; round++) {
        if (stopsPerRound[round] === undefined) stopsPerRound.push(new Set())

        // iterator over set is in insertion order, which means that transfers will tend to have their first stop above the second
        // on the Marey plot
        stopsPerRound[round].add(path[round][0])

        if (round < path.length - 1) {
          if (stopsPerRound[round + 1] === undefined) stopsPerRound.push(new Set())
          // don't insert final destination stop into rounds, it is not rendered as an individual line
          stopsPerRound[round + 1].add(path[round][2])
        }
      }
    }

    // number of horizontal lines, one per stop and a divider per round
    // remove first and last rounds as they don't get broken out with stop lines
    let nLines = stopsPerRound.filter((s, i, a) => i !== 0).map(s => s.size).reduce((a, b) => a + b, 1) + stopsPerRound.length + 1

    // space lines
    let roundOffsets = []

    // map from hash(round, stop ID) -> offset
    // arrays don't work as map keys unfortunately, evidently their hash function is based on memory location
    let stopOffsets = new Map()
    // compress out round 0 and the last round as they does not need stop lines, all stops are at the top/bottom of the plot
    for (let round = 1, offset = 0; round < stopsPerRound.length; round++) {
      for (let s of stopsPerRound[round].keys()) {
        offset += HEIGHT / nLines
        stopOffsets.set(stopRoundHash(round - 1, s), offset)
      }

      offset += HEIGHT / nLines
      roundOffsets.push(offset)
    }

    // line for dest
    roundOffsets.push(HEIGHT)

    return (
      <span>
        <svg style={{width: WIDTH + 'px', height: HEIGHT + 'px'}}>
          { /* horizontal lines for each round */ }
          { roundOffsets.map(r => <line style={{stroke: '#000'}} x0={0} x1={WIDTH} y1={r} y2={r} />) }

          { /* horizontal lines for each stop. can't use forEach with values so use IIFE */  }
          { (function () {
              let ret = []
              for (let e of stopOffsets.entries()) {
                ret.push(<line style={{stroke: '#aaa'}} x0={0} x1={WIDTH} y1={e[1]} y2={e[1]} />)
                // >> 5 to convert hash back to stop ID
                ret.push(<text style={{fontFamily: 'sans', fontSize: '9pt', fill: '#444'}} x={0} y={e[1]}>{ e[0] >> 5 }</text>)
              }
              return ret
            })() }

          {/* the marey lines */}
          { (function () {
            let elements = []
            let col = Color('#b00')
            for (let min = 0; min < paths.length; min++) {
              let path = paths[min]

              // no path at this minute, wait for next minute
              if (path === undefined) continue

              // rotate the color by 67 degrees, so that colors won't repeat exactly even after several paths
              // and nearby paths will have significantly different colors
              col.rotate(67)

              let offset = min / maxTime * WIDTH
              // right side of this path
              let offsetRight = (min + times[min]) / maxTime * WIDTH
              let offsetPerRound = (offsetRight - offset) / (stopsPerRound.length)

              // draw each round
              for (let round = 0, boardX, boardY, alightX, alightY; round < path.length; round++) {
                boardY = round === 0 ? 0 : stopOffsets.get(stopRoundHash(round - 1, path[round][0]))
                boardX = offset + round * offsetPerRound

                // handle transfers
                if (round > 0) {
                  elements.push(<line style={{stroke: col.hexString()}} x1={boardX} x2={alightX} y1={boardY} y2={alightY} />)
                }

                alightY = round === path.length - 1 ? HEIGHT : stopOffsets.get(stopRoundHash(round, path[round][2]))
                // snap to the correct offset at the end regardless of how many transfers this particular path has.
                alightX = round === path.length - 1 ? offsetRight : offset + (round + 1) * offsetPerRound

                elements.push(<line style={{stroke: col.hexString()}} x1={boardX} x2={alightX} y1={boardY} y2={alightY} />)

                elements.push(<circle cx={alightX} cy={alightY} r={5} style={{fill: col.hexString()}} />)
                elements.push(<circle cx={boardX} cy={boardY} r={5} style={{fill: col.hexString()}} />)

                // draw pattern numbers
                let frac = Math.random() * 0.75 + 0.125 // don't place all the way at either end
                let dX = alightX - boardX
                let dY = alightY - boardY
                let patternX = dX * frac + boardX
                let patternY = dY * frac + boardY
                // rotate text along line
                let rot = Math.atan(dY / dX) * 180 / Math.PI

                let pat = path[round][1] + ''
                let routeId = bc.transitiveData.patterns.filter(p => p.pattern_id === pat)[0].route_id
                let route = bc.transitiveData.routes.filter(r => r.route_id === routeId)[0].route_short_name

                elements.push(<text x={patternX} y={patternY} style={{fontFamily: 'sans', fontSize: '9pt', fill: col.hexString()}} transform={`rotate(${rot} ${patternX} ${patternY})`}>{route}</text>)
              }
            }

            return elements
          })()}
        </svg>
        <div style={{float: 'right'}}>
          X/Y<br/>
          {bc.origin.x} / {bc.origin.y}<br/>
          to<br/>
          {this.props.dest.x} / {this.props.dest.y}<br/>
          {stopsPerRound.length + 1} rounds
        </div>
      </span>)
  }
}

/** return a unique int for use in a map for a stop and round */
function stopRoundHash (round, stop) {
  // assume less than 64 rounds
  // NB this hash is converted back to the stop ID where the stop ID is rendered on lines, so if you change the offset
  // here you must change it there as well
  return (stop << 5) + round
}

// bug in babel means export has to be separate from class declaration: http://stackoverflow.com/questions/33455166
export default Marey
