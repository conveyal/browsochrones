module.exports = {
  entry: ['babel-polyfill', './example.js'],
  output: {
    filename: './assets/index.js'
  },
  resolve: {
    alias: {
      webworkify: 'webworkify-webpack'
    }
  },
  module: {
    loaders: [
      {
        test: /\.js$/,
        loader: 'babel-loader',
        query: {
          presets: ['env', 'react', 'stage-2']
        },
        exclude: /node_modules/
      }
    ]
  }
}
