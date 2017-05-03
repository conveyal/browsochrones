// iteration width
export const ITERATION_WIDTH = 4

// arbitrary value that determines how aggressively to cluster results (higher
// is more aggressive, and a high number is something like 1e-3)
export const MAX_DISSIMILARITY = 5e-6

// maximum path segments before we conclude that either R5 or Browsochrones is
// off its rocker and bail (we do this so that we don't generate and attempt to
// render crazy paths; it implies a bug but it's better to log an error message
// than crash the user's browser)
export const MAX_PATH_SEGMENTS = 8

// Maximum transitive paths to show
export const MAX_TRANSITIVE_PATHS = 5

// Maximum trip length
export const MAX_TRIP_LENGTH_MINUTES = 120
