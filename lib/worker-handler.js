
export default function handle (functions) {
  return function handler (self) {
    const cache = {}

    self.addEventListener('message', function (event) {
      const {command, id, message} = event.data
      console.log(command, message)
      Promise
        .resolve(functions[command].call(null, cache, message))
        .then(results => {
          self.postMessage({
            command,
            id,
            message: results
          })
        })
        .catch(e => {
          console.error(e)
          e.id = id
          throw e
        })
    })
  }
}
