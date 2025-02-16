const Redis = require("redis");
const { promisify } = require("util");

class RedisService {
  constructor() {
    this.client = Redis.createClient({
      port: process.env.REDIS_PORT,
      host: process.env.REDIS_HOST,
      password: process.env.REDIS_PASSWORD,
    });

    this.getAsync = promisify(this.client.get).bind(this.client);
    this.setAsync = promisify(this.client.set).bind(this.client);

    this.client.on("error", (err) => console.log("Redis Client Error", err));
  }

  async get(key) {
    try {
      const data = await this.getAsync(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("Redis Get Error:", error);
      return null;
    }
  }

  async set(key, value, expirationInSeconds = 3600) {
    try {
      await this.setAsync(
        key,
        JSON.stringify(value),
        "EX",
        expirationInSeconds
      );
    } catch (error) {
      console.error("Redis Set Error:", error);
    }
  }

  async invalidate(pattern) {
    try {
      const keys = await promisify(this.client.keys).bind(this.client)(pattern);
      if (keys.length > 0) {
        await promisify(this.client.del).bind(this.client)(...keys);
      }
    } catch (error) {
      console.error("Redis Invalidation Error:", error);
    }
  }
}

module.exports = {
  RedisService,
};
