import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// The signed-in screens are loaded when a route needs them, and the first test of a file that opens one pays for loading it
// inside the lookup timeout. On a busy machine or a cold start that took more than the default second, and the first test of
// seven files failed on the first run and passed on the next. A lookup that finds its element returns at once either way.
configure({ asyncUtilTimeout: 5000 })

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
})
