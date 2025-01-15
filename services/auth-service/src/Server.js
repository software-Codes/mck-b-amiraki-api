// Server.js
import dotenv from 'dotenv';
import { createApp } from './app/app.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    const { app, server, initialize } = createApp();
    await initialize();

    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log('Available test routes:');
      console.log('- GET  /health    : Check server health');
      console.log('- GET  /db-test   : Test database connection');
      console.log('- POST /test-user : Create a test user');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();