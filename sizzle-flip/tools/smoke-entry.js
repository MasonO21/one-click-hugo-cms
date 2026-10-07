// Entry point of the self-test build (node tools/build.mjs --smoke): the game, then the on-device self-test.
import '../src/main.js';
import './device-smoke.js';
