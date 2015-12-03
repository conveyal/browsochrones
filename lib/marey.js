/**
 * Render a Marey plot showing paths.
 * @author mattwigway, after E. J. Marey, 1885, and Ibry (neither of whom have github accounts I assume)
 */

import React, {Component, PropTypes} from 'react'
import {getPaths, getPath} from './get-transitive-data'

const HEIGHT = 220
const WIDTH = 1600

class Marey extends Component {
  static propTypes = {
    browsochrones: PropTypes.object.isRequired,
    dest: PropTypes.object.isRequired
  }

  render () {
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

    for (let path of pathSet.values()) {
      for (let round = 0; round < path.length; round++) {
        if (stopsPerRound[round] === undefined) stopsPerRound.push(new Set())
        if (stopsPerRound[round + 1] === undefined) stopsPerRound.push(new Set())

        // iterator over set is in insertion order, which means that transfers will tend to have their first stop above the second
        // on the Marey plot
        stopsPerRound[round].add(path[round][0])
        stopsPerRound[round + 1].add(path[round][2])
      }
    }

    // number of horizontal lines
    let nLines = stopsPerRound.map(s => s.size).reduce((a, b) => a + b) + stopsPerRound.length

    // space lines
    let roundOffsets = []

    // map from [round, stop ID] -> offset
    let stopOffsets = new Map()
    for (let round = 1, offset = 20; round < stopsPerRound.length; round++) {
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
              for (let s of stopOffsets.values()) ret.push(<line style={{stroke: '#aaa'}} x0={0} x1={WIDTH} y1={s} y2={s} />)
              return ret
            })() }

          {/* the marey lines */}
          { (function () {
            let elements = []
            for (let min = 0; min < paths.length; min++) {
              let path = paths[min]

              // no path at this minute, wait for next minute
              if (path === undefined) continue

              let offset = min / maxTime * WIDTH
              let offsetPerRound = ((min + times[min]) / maxTime * WIDTH - offset) / path.length

              // draw each round
              for (let round = 0, boardX, boardY, alightX, alightY; round < path.length; round++) {
                boardY = round === 0 ? 0 : stopOffsets.get(stopRoundHash(round - 1, path[round][0]))
                boardX = offset + round * offsetPerRound

                // handle transfers
                if (round > 0) {
                  elements.push(<line style={{stroke: '#d99'}} x1={boardX} x2={alightX} y1={boardY} y2={alightY} />)
                }

                alightY = round === path.length - 1 ? HEIGHT : stopOffsets.get(stopRoundHash(round, path[round][2]))
                alightX = offset + (round + 1) * offsetPerRound

                elements.push(<line style={{stroke: '#f00'}} x1={boardX} x2={alightX} y1={boardY} y2={alightY} />)

                elements.push(<circle cx={alightX} cy={alightY} r={5} style={{fill: '#caa'}} />)
                elements.push(<circle cx={boardX} cy={boardY} r={5} style={{fill: '#caa'}} />)
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
          {stopsPerRound.length} rounds
        </div>
      </span>)
  }
}

/** return a unique int for use in a map for a stop and round */
function stopRoundHash (round, stop) {
  // assume less than 64 rounds
  return (stop << 5) + round
}

// bug in babel means export has to be separate from class declaration: http://stackoverflow.com/questions/33455166
export default Marey
