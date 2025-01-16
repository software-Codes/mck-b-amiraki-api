// src/models/user.js
const { sql } = require("../config/database");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const imagekit = require('../config/imagekit');

// Create a new user
// Upload profile photo to ImageKit
const uploadProfilePhoto = async (file, userId) => {
  try {
    // Upload to ImageKit
    const upload = await imagekit.upload({
      file: file.buffer.toString("base64"),
      fileName: `profile-${userId}-${Date.now()}`,
      folder: "/profile-photos",
      transformation: [
        {
          height: 400,
          width: 400,
          crop: "at_max",
        },
      ],
    });

    // Update user's profile_picture_url in database
    const user = await sql`
            UPDATE users 
            SET 
                profile_picture_url = ${upload.url},
                updated_at = NOW()
            WHERE id = ${userId}
            RETURNING id, full_name, email, profile_picture_url;
        `;

    return user[0];
  } catch (error) {
    throw new Error(`Error uploading profile photo: ${error.message}`);
  }
};

// Create a new user
const createUser = async ({
  fullName,
  email,
  password,
  phoneNumber,
  profilePhoto,
}) => {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await sql`
            INSERT INTO users (
                full_name,
                email,
                password,
                phone_number
            ) VALUES (
                ${fullName},
                ${email},
                ${hashedPassword},
                ${phoneNumber}
            )
            RETURNING id, full_name, email, phone_number, created_at;
        `;

    // If profile photo was provided, upload it
    if (profilePhoto) {
      return await uploadProfilePhoto(profilePhoto, user[0].id);
    }

    return user[0];
  } catch (error) {
    if (error.code === "23505") {
      throw new Error("Email already exists");
    }
    throw error;
  }
};

// Update profile photo
const updateProfilePhoto = async (userId, file) => {
  try {
    // Get current user to delete old photo if exists
    const currentUser = await findUserById(userId);
    if (currentUser.profile_picture_url) {
      // Extract fileId from URL and delete from ImageKit
      const fileId = currentUser.profile_picture_url
        .split("/")
        .pop()
        .split(".")[0];
      try {
        await imagekit.deleteFile(fileId);
      } catch (error) {
        console.error("Error deleting old profile photo:", error);
      }
    }

    return await uploadProfilePhoto(file, userId);
  } catch (error) {
    throw new Error(`Error updating profile photo: ${error.message}`);
  }
};

// Login user
const loginUser = async (email, password) => {
  try {
    // Find user by email
    const user = await sql`
      SELECT id, full_name, email, password, is_verified
      FROM users
      WHERE email = ${email};
    `;

    if (!user[0]) {
      throw new Error("Invalid email or password");
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user[0].password);
    if (!isValidPassword) {
      throw new Error("Invalid email or password");
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user[0].id,
        email: user[0].email,
        isVerified: user[0].is_verified,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    // Return user data without password and include token
    const { password: _, ...userWithoutPassword } = user[0];
    return {
      user: userWithoutPassword,
      token,
    };
  } catch (error) {
    throw error;
  }
};

// Verify JWT token
const verifyToken = async (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await findUserById(decoded.userId);

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  } catch (error) {
    throw new Error("Invalid token");
  }
};

// Find user by email
const findUserByEmail = async (email) => {
  const users = await sql`
    SELECT id, full_name, email, password, phone_number, is_verified
    FROM users
    WHERE email = ${email};
  `;
  return users[0];
};

// Find user by ID
const findUserById = async (userId) => {
  const users = await sql`
    SELECT id, full_name, email, phone_number, is_verified, created_at, updated_at
    FROM users
    WHERE id = ${userId};
  `;
  return users[0];
};

// Update user information
const updateUser = async (userId, updates) => {
  const allowedUpdates = ["full_name", "phone_number"];
  const setValues = [];
  const values = [];

  Object.keys(updates).forEach((key) => {
    if (allowedUpdates.includes(key) && updates[key] !== undefined) {
      setValues.push(`${key} = $${setValues.length + 1}`);
      values.push(updates[key]);
    }
  });

  if (setValues.length === 0) return null;

  values.push(userId);

  const query = `
    UPDATE users 
    SET ${setValues.join(", ")}, updated_at = NOW()
    WHERE id = $${values.length}
    RETURNING id, full_name, email, phone_number, updated_at;
  `;

  const result = await sql.query(query, values);
  return result.rows[0];
};

// Update password
const updatePassword = async (userId, newPassword) => {
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const user = await sql`
    UPDATE users
    SET password = ${hashedPassword}, updated_at = NOW()
    WHERE id = ${userId}
    RETURNING id;
  `;

  return user[0];
};

// Verify user's password
const verifyPassword = async (plainPassword, hashedPassword) => {
  return bcrypt.compare(plainPassword, hashedPassword);
};

// Delete user
const deleteUser = async (userId) => {
  const result = await sql`
    DELETE FROM users
    WHERE id = ${userId}
    RETURNING id;
  `;
  return result[0];
};

module.exports = {
  createUser,
  loginUser,
  updateProfilePhoto,
  uploadProfilePhoto,
  imagekit,
  verifyToken,
  findUserByEmail,
  findUserById,
  updateUser,
  updatePassword,
  verifyPassword,
  deleteUser,
};
