// Native modules are not available under Jest. Tests that need one mock it themselves.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-speech-recognition', () => require('./src/test/speechMock').speechMock);
