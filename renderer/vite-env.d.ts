/// <reference types="vite/client" />

import type { PharmacyApi } from '../electron/preload';

declare global {
  interface Window {
    pharmacy: PharmacyApi;
  }
}
