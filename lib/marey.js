/**
 * Render a Marey plot showing paths.
 * @author mattwigway, after E. J. Marey, 1885, and Ibry (neither of whom have github accounts I assume)
 */

import React from 'react'
import {getPaths, getPath} from './get-transitive-data'
import Color from 'color'

const HEIGHT = 220

function Marey ({ browsochrones, dest }) {
  const WIDTH = window.innerWidth - 20

  // figure out how many unique stops there are in each round
  const stopsPerRound = []
  let { paths, times } = getPaths({origin: browsochrones.origin, to: dest, stopTreeCache: browsochrones.stopTrees, query: browsochrones.query})

  // they come out of r5 backwards
  times.reverse()
  paths.reverse()

  // clear the ones that are the same and arrive at the same time
  for (let p = 0; p < paths.length - 1; p++) {
    // + 1: time is offset one minute (wait one minute and take the trip at the next minute)
    if (times[p] === times[p + 1] + 1 && paths[p][0] === paths[p + 1][0] && paths[p][1] === paths[p + 1][1]) paths[p] = undefined
  }

  paths = paths.map(path => path === undefined ? undefined : getPath({ pathDescriptor: path, origin: browsochrones.origin }))

  const pathSet = new Set(paths.filter(path => path !== undefined))

  // find the right-most time
  // in theory, this is just the last value of times plus the number of minutes, but we want to render
  // overtaking paths if they exist
  const maxTime = times
    .filter(t => t !== 255)
    .map((t, i) => t + i)
    .reduce((a, b) => Math.max(a, b), 0)

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
  const nLines = stopsPerRound.filter((s, i, a) => i !== 0).map(s => s.size).reduce((a, b) => a + b, 1) + stopsPerRound.length + 1

  // space lines
  const roundOffsets = []

  // map from hash(round, stop ID) -> offset
  // arrays don't work as map keys unfortunately, evidently their hash function is based on memory location
  const stopOffsets = {}
  // compress out round 0 and the last round as they does not need stop lines, all stops are at the top/bottom of the plot
  for (let round = 1, offset = 0; round < stopsPerRound.length; round++) {
    for (let s of stopsPerRound[round].keys()) {
      offset += HEIGHT / nLines
      stopOffsets[stopRoundHash(round - 1, s)] = offset
    }

    offset += HEIGHT / nLines
    roundOffsets.push(offset)
  }

  // line for dest
  roundOffsets.push(HEIGHT)

  const horizontalLinesPerRound = roundOffsets.map((r, i) => <line key={i} style={{stroke: '#000'}} x0={0} x1={WIDTH} y1={r} y2={r} />)
  const horizontalLinesPerStop = Object.keys(stopOffsets).map(k => {
    return (
      <g key={k}>
        <line style={{stroke: '#aaa'}} x0={0} x1={WIDTH} y1={stopOffsets[k]} y2={stopOffsets[k]} />
        <text style={{fontFamily: 'sans', fontSize: '9pt', fill: '#444'}} x={0} y={stopOffsets[k]}>{ k >> 5 }</text>
      </g>
    )
  })

  return (
    <svg style={{width: WIDTH + 'px', height: HEIGHT + 'px'}}>
      {horizontalLinesPerRound}
      {horizontalLinesPerStop}
      <MareyLines browsochrones={browsochrones} maxTime={maxTime} paths={paths} stopsPerRound={stopsPerRound} stopOffsets={stopOffsets} times={times} width={WIDTH} />
    </svg>
  )
}

function MareyLines ({browsochrones, maxTime, paths, stopsPerRound, stopOffsets, times, width}) {
  const col = Color('#b00')

  return <g>{paths.map((path, min) => {
    if (path === undefined) return

    // rotate the color by 67 degrees, so that colors won't repeat exactly even after several paths
    // and nearby paths will have significantly different colors
    col.rotate(67)

    const offset = min / maxTime * width
    // right side of this path
    const offsetRight = (min + times[min]) / maxTime * width
    const offsetPerRound = (offsetRight - offset) / (stopsPerRound.length)

    // draw each round
    return <g key={min}>{path.map((p, round) => {
      const hexString = col.hexString()
      const boardY = round === 0 ? 0 : stopOffsets[stopRoundHash(round - 1, path[round][0])]
      const boardX = offset + round * offsetPerRound

      const alightY = round === path.length - 1 ? HEIGHT : stopOffsets[stopRoundHash(round, path[round][2])]
      // snap to the correct offset at the end regardless of how many transfers this particular path has.
      const alightX = round === path.length - 1 ? offsetRight : offset + (round + 1) * offsetPerRound

      // draw pattern numbers
      const frac = Math.random() * 0.75 + 0.125 // don't place all the way at either end
      const dX = alightX - boardX
      const dY = alightY - boardY
      const patternX = dX * frac + boardX
      const patternY = dY * frac + boardY
      // rotate text along line
      const rot = Math.atan(dY / dX) * 180 / Math.PI

      const pat = path[round][1] + ''
      const routeId = browsochrones.transitiveData.patterns.find(p => p.pattern_id === pat).route_id
      const route = browsochrones.transitiveData.routes.find(r => r.route_id === routeId).route_short_name

      return (
        <g key={round}>
          {(function () {
            if (round > 0) return <line style={{stroke: hexString}} x1={boardX} x2={alightX} y1={boardY} y2={alightY} />
          })()}

          <line style={{stroke: hexString}} x1={boardX} x2={alightX} y1={boardY} y2={alightY} />

          <circle cx={alightX} cy={alightY} r={5} style={{fill: hexString}} />
          <circle cx={boardX} cy={boardY} r={5} style={{fill: hexString}} />

          <text x={patternX} y={patternY} style={{fontFamily: 'sans', fontSize: '9pt', fill: col.hexString()}} transform={`rotate(${rot} ${patternX} ${patternY})`}>{route}</text>
        </g>
      )
    })}</g>
  })}</g>
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
