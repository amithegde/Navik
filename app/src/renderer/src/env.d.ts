/// <reference types="vite/client" />

import type { NavikApi } from '../../preload/index'

declare global {
  interface Window {
    navik: NavikApi
  }
}

export {}
