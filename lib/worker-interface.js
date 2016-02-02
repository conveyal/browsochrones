import uuid from 'uuid'
import workify from 'webworkify'

export default class WorkerInterface {
  _errorHandlers = []
  _messageHandlers = []

  constructor (workerHandler) {
    this._worker = workify(workerHandler)
    this._worker.addEventListener('message', event => this._handleMessage(event))
    this._worker.addEventListener('error', event => this._handleError(event))
  }

  work ({command, message, transferrable}) {
    return new Promise((resolve, reject) => {
      const id = uuid.v4()

      this._messageHandlers.push({
        fn: event => {
          if (event.id === id) {
            this._clearHandlersFor(id)
            resolve(event.message)
          }
        },
        id
      })

      this._errorHandlers.push({
        fn: error => {
          if (error.id === id) {
            this._clearHandlersFor(id)
            reject(error)
          }
        },
        id
      })

      this._worker.postMessage({command, id, message}, transferrable)
    })
  }

  _handleMessage (event) {
    this._messageHandlers.forEach(handler => handler.fn(event.data))
  }

  _handleError (error) {
    this._errorHandlers.forEach(handler => handler.fn(error))
  }

  _clearHandlersFor (id) {
    this._messageHandlers = this._messageHandlers.filter(h => h.id !== id)
    this._errorHandlers = this._errorHandlers.filter(h => h.id !== id)
  }
}
