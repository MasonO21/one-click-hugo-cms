/* global jest */
// The theme reads the appearance setting from a persisted store, so every rendered component
// touches storage. Tests that need their own storage behaviour still mock it per file.
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
