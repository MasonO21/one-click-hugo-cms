// Import this before anything that loads src/lib/api: the client reads the server address when it
// loads, and without one it runs in demo mode and never calls the network.
process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test';
