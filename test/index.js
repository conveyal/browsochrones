import test from 'tape'
import getSurface from '../get-surface'

test('getSurface', (assert) => {
  assert.pass(getSurface(false))
  assert.end()
})
