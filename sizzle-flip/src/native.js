// Native (Capacitor) plugins. Importing @capacitor/core sets up window.Capacitor.registerPlugin; the native bridge
// alone doesn't provide it, so without this import the app can't reach its plugins on a phone (and would fall back
// to the web behaviour). In a browser, NATIVE is false and no plugin is touched.
import { Capacitor } from '@capacitor/core';

export const NATIVE = Capacitor.isNativePlatform();
export const PLATFORM = Capacitor.getPlatform();           // 'android' | 'ios' | 'web'
const cache = {};
// a plugin's proxy (null in a browser). Each plugin is registered once.
export const nativePlugin = (name) => (NATIVE ? (cache[name] = cache[name] || window.Capacitor.registerPlugin(name)) : null);
