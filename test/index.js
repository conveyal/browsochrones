import test from 'tape'
import getSurface from '../lib/get-surface'

test('getSurface', (assert) => {
  assert.pass(getSurface(false))
  assert.end()
})
