// const Redis = require("redis");

// class RedisService {
//   constructor() {
//     this.client = Redis.createClient({
//       socket: {
//         host: process.env.REDIS_HOST,
//         port: process.env.REDIS_PORT,
//       },
//       password: process.env.REDIS_PASSWORD,
//     });

//     this.client.on("error", (err) => console.log("Redis Client Error", err));

//     // Ensure connection
//     this.connect();
//   }

//   async connect() {
//     if (!this.client.isOpen) {
//       await this.client.connect();
//     }
//   }

//   async get(key) {
//     try {
//       await this.connect(); // Ensure the client is connected
//       const data = await this.client.get(key);
//       return data ? JSON.parse(data) : null;
//     } catch (error) {
//       console.error("Redis Get Error:", error);
//       return null;
//     }
//   }

//   async set(key, value, expirationInSeconds = 3600) {
//     try {
//       await this.connect(); // Ensure the client is connected
//       await this.client.setEx(key, expirationInSeconds, JSON.stringify(value));
//     } catch (error) {
//       console.error("Redis Set Error:", error);
//     }
//   }

//   async invalidate(pattern) {
//     try {
//       await this.connect(); // Ensure the client is connected
//       const keys = await this.client.keys(pattern);
//       if (keys.length > 0) {
//         await this.client.del(keys);
//       }
//     } catch (error) {
//       console.error("Redis Invalidation Error:", error);
//     }
//   }

//   async disconnect() {
//     if (this.client.isOpen) {
//       await this.client.quit();
//     }
//   }
// }

// module.exports = {
//   RedisService,
// };
