const Redis = require("redis");

/**
 * RedisService class provides methods to interact with a Redis datastore.
 *
 * It ensures that a connection to the Redis server is established before any operation.
 * Methods include retrieving data, setting values with expiration, invalidating keys,
 * and gracefully disconnecting.
 */
class RedisService {
  /**
   * Creates a RedisService instance, initializes the Redis client, and sets up event listeners.
   * The constructor attempts an initial connection to the Redis server.
   */
  constructor() {
    const redisUrl = `rediss://:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`;
  
    this.client = Redis.createClient({
      url: redisUrl
    });

    // Log error events from the Redis client
    this.client.on("error", (err) => console.error("Redis Client Error:", err));

    // Attempt an initial connection to the Redis server
    this.connect()
      .then(() => console.info("Connected to Redis server successfully."))
      .catch((err) => console.error("Initial Redis connection failed:", err));
  }

  /**
   * Establishes a connection to the Redis server if not already connected.
   * @returns {Promise<void>}
   */
  async connect() {
    if (!this.client.isOpen) {
      console.info("Attempting to connect to Redis server...");
      await this.client.connect();
    }
  }

  /**
   * Retrieves a value from Redis for a given key.
   * @param {string} key - The key whose value is to be retrieved.
   * @returns {Promise<any>} - The parsed JSON object if found, otherwise null.
   */
  async get(key) {
    try {
      // Ensure the client is connected before performing the operation
      await this.connect();
      console.info(`Fetching data from Redis for key: ${key}`);
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Redis Get Error for key "${key}":`, error);
      return null;
    }
  }

  /**
   * Stores a value in Redis with a specified expiration time.
   * @param {string} key - The key under which the value is stored.
   * @param {any} value - The value to store (will be serialized to JSON).
   * @param {number} [expirationInSeconds=3600] - Time-to-live for the key in seconds (default is 1 hour).
   * @returns {Promise<void>}
   */
  async set(key, value, expirationInSeconds = 3600) {
    try {
      // Ensure the client is connected before performing the operation
      await this.connect();
      console.info(`Setting data in Redis for key: ${key} with expiration of ${expirationInSeconds} seconds.`);
      await this.client.setEx(key, expirationInSeconds, JSON.stringify(value));
    } catch (error) {
      console.error(`Redis Set Error for key "${key}":`, error);
    }
  }

  /**
   * Invalidates (deletes) Redis keys matching a given pattern.
   * @param {string} pattern - Pattern to match keys (e.g., 'user:*').
   * @returns {Promise<void>}
   */
  async invalidate(pattern) {
    try {
      // Ensure the client is connected before performing the operation
      await this.connect();
      console.info(`Invalidating Redis keys matching pattern: ${pattern}`);
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
        console.info(`Deleted ${keys.length} key(s) matching pattern: ${pattern}`);
      } else {
        console.info(`No keys found matching pattern: ${pattern}`);
      }
    } catch (error) {
      console.error(`Redis Invalidation Error for pattern "${pattern}":`, error);
    }
  }

  /**
   * Disconnects the Redis client gracefully.
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.client.isOpen) {
      console.info("Disconnecting from Redis server...");
      await this.client.quit();
      console.info("Disconnected from Redis server.");
    } else {
      console.info("Redis client is already disconnected.");
    }
  }
}

module.exports = {
  RedisService,
};
