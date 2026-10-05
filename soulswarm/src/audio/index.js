// Audio facade. Forwards to the procedural synth in audio.js once it has loaded,
// so the rest of the game never has to care whether audio is available.
const silent = {
  init() {}, sfx() {}, playMusic() {}, stopMusic() {}, setVolumes() {}, setMuted() {}, muted: false,
};
let impl = silent;

export const audio = {
  init: (...a) => impl.init(...a),
  sfx: (...a) => impl.sfx(...a),
  playMusic: (...a) => impl.playMusic(...a),
  stopMusic: (...a) => impl.stopMusic(...a),
  setVolumes: (...a) => impl.setVolumes(...a),
  setMuted: (...a) => impl.setMuted(...a),
  get muted() { return !!impl.muted; },
};

export function loadAudio() {
  return import('./audio.js')
    .then((m) => { impl = m.default || m.Audio || silent; })
    .catch((e) => { console.warn('audio unavailable', e); });
}
