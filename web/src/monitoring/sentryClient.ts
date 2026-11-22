// The only two things of the Sentry client the app uses. A separate file, so that the rest of the library is left out of the build.
export { captureException, init } from '@sentry/browser'
