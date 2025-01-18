// src/models/userModel.js
const { sql } = require("../config/database");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const createUser = async ({
  fullName,
  email,
  password,
  phoneNumber,
  profilePhoto,
  isAdmin = false,
}) => {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await sql`
      INSERT INTO users (
        full_name,
        email,
        password,
        phone_number,
        is_admin,
        status,
        created_at,
        updated_at
      ) VALUES (
        ${fullName},
        ${email},
        ${hashedPassword},
        ${phoneNumber},
        ${isAdmin},
        'active',
        NOW(),
        NOW()
      )
      RETURNING id, full_name, email, phone_number, created_at, status;
    `;

    // Handle profile photo if provided
    if (profilePhoto) {
      return await uploadProfilePhoto(profilePhoto, user[0].id);
    }

    return user[0];
  } catch (error) {
    if (error.code === "23505") {
      throw new Error("Email or phone number already exists");
    }
    throw error;
  }
};

const loginUser = async (email, password) => {
  try {
    const user = await sql`
      SELECT id, full_name, email, password, is_admin, status
      FROM users
      WHERE email = ${email} AND status = 'active';
    `;

    if (!user[0]) {
      throw new Error("Invalid email or password");
    }

    const isValidPassword = await bcrypt.compare(password, user[0].password);
    if (!isValidPassword) {
      throw new Error("Invalid email or password");
    }

    const token = jwt.sign(
      {
        userId: user[0].id,
        email: user[0].email,
        isAdmin: user[0].is_admin,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    const { password: _, ...userWithoutPassword } = user[0];
    return {
      user: userWithoutPassword,
      token,
    };
  } catch (error) {
    throw error;
  }
};

// Get user by ID
const getUserById = async (userId) => {
  const user = await sql`
    SELECT id, full_name, email, phone_number, is_admin, status, created_at, updated_at
    FROM users
    WHERE id = ${userId};
  `;
  return user[0];
};

// Get all users (with pagination)
const getAllUsers = async (page = 1, limit = 10) => {
  const offset = (page - 1) * limit;
  
  const users = await sql`
    SELECT 
      id, full_name, email, phone_number, is_admin, status, created_at, updated_at
    FROM users
    ORDER BY created_at DESC
    LIMIT ${limit}
    OFFSET ${offset};
  `;

  const totalUsers = await sql`
    SELECT COUNT(*) FROM users;
  `;

  return {
    users,
    total: totalUsers[0].count,
    page,
    totalPages: Math.ceil(totalUsers[0].count / limit)
  };
};

// Update user
const updateUser = async (userId, updates) => {
  const allowedUpdates = ["full_name", "phone_number", "email"];
  const updateFields = [];
  const values = [];

  Object.keys(updates).forEach((key) => {
    if (allowedUpdates.includes(key) && updates[key] !== undefined) {
      updateFields.push(`${key} = $${updateFields.length + 1}`);
      values.push(updates[key]);
    }
  });

  if (updateFields.length === 0) return null;

  values.push(userId);
  const query = `
    UPDATE users 
    SET ${updateFields.join(", ")}, updated_at = NOW()
    WHERE id = $${values.length}
    RETURNING id, full_name, email, phone_number, updated_at;
  `;

  const result = await sql.query(query, values);
  return result.rows[0];
};

// Update password
const updatePassword = async (userId, currentPassword, newPassword) => {
  const user = await getUserById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const isValidPassword = await bcrypt.compare(currentPassword, user.password);
  if (!isValidPassword) {
    throw new Error("Current password is incorrect");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await sql`
    UPDATE users
    SET 
      password = ${hashedPassword},
      updated_at = NOW()
    WHERE id = ${userId}
  `;

  return true;
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

// Update user status (active/inactive)
const updateUserStatus = async (userId, status) => {
  if (!['active', 'inactive'].includes(status)) {
    throw new Error("Invalid status");
  }

  const user = await sql`
    UPDATE users
    SET 
      status = ${status},
      updated_at = NOW()
    WHERE id = ${userId}
    RETURNING id, status;
  `;

  return user[0];
};

module.exports = {
  createUser,
  loginUser,
  getUserById,
  getAllUsers,
  updateUser,
  updatePassword,
  deleteUser,
  updateUserStatus
};