// @flow

export type Case = 'AVERAGE' | 'BEST_CASE' | 'MEDIAN' | 'WORST_CASE'

export type Coords = {
  x: number,
  y: number,
  z: number
}

export type Feature = {
  type: string,
  geometry: {
    type: 'string',
    coordinates: number[][]
  }
}

export type Grid = {
  contains: (number, number) => boolean,
  data: Int32Array,
  north: number,
  west: number,
  height: number,
  width: number,
  zoom: number
}

export type ImageData = {
  data: Uint8ClampedArray,
  height: number,
  width: number
}

export type LatLon = {
  lat: number,
  lon: number
}

export type Origin = {
  data: Int32Array,
  index: Int32Array,
  nMinutes: number,
  nStops: number,
  radius: number,
  x: number,
  y: number
}

export type PathDescriptor = [number, number]

export type Place = {
  place_id: string,
  place_name: ?string,
  place_lat: number,
  place_lon: number
}

export type Point = {
  name?: string,
  x: number,
  y: number
}

export type Query = {
  height: number,
  width: number,
  north: number,
  west: number,
  zoom: number
}

export type StopTreeCache = {
  data: Int32Array,
  index: Int32Array
}

export type Segment = {
  color?: string,
  from?: {
    place_id?: string,
    type: string
  },
  to?: {
    place_id?: string,
    stop_id?: string,
    type: string
  },
  from_stop_index?: number,
  to_stop_index?: number,
  pattern_id?: string,
  type: string
}

export type Stop = {
  stop_id: string,
  stop_lat: number,
  stop_lon: number
}

export type Pattern = {
  pattern_id: string,
  route_id: string,
  stops: Stop[]
}

export type StopPatternStop = [number, number, number]
export type StopPatternStops = StopPatternStop[]

export type Journey = {
  journey_id: string | number,
  journey_name: string | number,
  segments: Segment[]
}

export type Route = {
  route_id: string
}

export type TransitiveData = {
  journeys?: Journey[],
  patterns: Pattern[],
  places?: Place[],
  routes: Route[],
  stops: Stop[]
}
