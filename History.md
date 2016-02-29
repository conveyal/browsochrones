
### 0.1.1 — 2016-02-29

  * Add `babel-plugin-add-module-exports`.
  * Update `web-worker-promise-interface`.

### 0.1.0 — 2016-02-26

  * Promisify interface.
  * Move processing to WebWorkers.

### 0.0.11 — 2016-01-28

  * Fix arrow function conversion to return the value
  * Fix string interpolation
  * Don't use ES6 in the index.html
  * Always bind drawTile, closes #20
  * Fix schematic map so it doesn't crash.
  * Cluster routes.

### 0.0.10 — 2016-01-19

  * Rename accessibilityFor{Cutoff => Grid} to better match what the function does now.
  * Allow calculating accessibility for arbitrary grids after surfaces have been generated.
  * Make leaflet a devDepenency
  * Only calculate accessibility for one variable at a time.
  * Move assignment so it happens less often.
  * Switch to using integer grids.
  * Improve code readability (and speed, slightly)
  * Work with multiple grids simultaneously.
  * Update grid url.
  * Add play button to show expanding isochrone animation, purely for fun.
  * Fix lint errors.

### 0.0.8 — 2015-12-15

* Make `color` a dependency.

### 0.0.7 — 2015-12-10

* Move marey into test/ for now.
* Split up Marey rendering.
* Base width on window.
* Move react/react-dom into devDependencies.
* Fix conveyal/r5#24
* Fix typo in non-transit-time calculation.
* Make pseudo color tiles bearably fast (#10)
* Add configurable color scheme, default to pseudo color. fixes #10.
* Label with route name not r5 internal pattern ID.
* Fix #8 (overtaking trips, display bug)
* Fix #11 (first stop in marey plot not used)
* Label patterns in Marey plot.
* Marey plots, now in living color.
* Remove code that was inadvertently removing all walk-only paths.
* -1 / 60 = 0, which meant that unreachable areas were becoming reachable. Fixes #6.
* Remove incorrect use of bitwise operations, fixes #7.
* Make Marey plot more readable.
* Add readout on origin/destination location and number of rounds to Marey graph.
* Add marey graph component, fixes #4.
* Split getTransitiveData up into multiple functions, to allow implementation of #4.
* De-delta-code times and pre-divide.

### 0.0.6 — 2015-12-01

* Remove `Math.max` from `generateSurface` to get 4x increase in speed.

### 0.0.5 — 2015-11-27

* Add `isReady` and `isLoaded` functions.
* Throw errors if Browoschrones is not ready or loaded.

### 0.0.4 — 2015-11-17

* Utilizing new format, automatically compute access value.

### 0.0.3 — 2015-11-13

* Do not automatically compute access values in `get-surface`.

### 0.0.2 — 2015-11-13

* Fix linter errors
* Publish regular Babeled build
* Ignore all in build
* move `lib/browsochrone.js` to `lib/index.js`
* Time origin fetching for comparison
* Add description
* Include non-transit times in getSurface results
* Support generating transitive data.
* Include paths in stop tree files.

### 0.0.1 — 2015-11-12

* Initial publish.
