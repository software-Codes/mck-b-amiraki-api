const socketIo = require("socket.io");
const redisAdapter = require("socket.io-redis");
const redis = require("redis");

class SocketIORedisAdapter {
  constructor(server, redisConfig) {
    this.io = socketIo(server);
    // Create Redis publisher and subscriber clients
    const pubClient = redis.createClient(redisConfig);
    const subClient = redis.createClient(redisConfig);
    // Handle Redis errors
    pubClient.on("error", (err) => {
      console.error("Redis Publisher Error:", err);
    });
    subClient.on("error", (err) => {
      console.error("Redis Subscriber Error:", err);
    });
    // Set up Redis adapter
    this.io.adapter(redisAdapter({ pubClient, subClient }));
    return this.io;
  }
}
module.exports = { SocketIORedisAdapter };
