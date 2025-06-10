import { defineConfig } from 'vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// https://vitejs.dev/config
export default defineConfig({
  build: {
    sourcemap: true, // Required for Sentry sourcemaps
  },
  plugins: [
    sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN, // NOTE: This should be available only during CI
      org: process.env.SENTRY_ORG, // NOTE: This should be available only during CI
      project: process.env.SENTRY_PROJECT, // NOTE: This should be available only during CI
    }),
  ],
})
