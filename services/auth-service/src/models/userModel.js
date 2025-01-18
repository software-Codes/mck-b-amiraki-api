const { sql } = require("../config/database");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// User roles enum
const UserRoles = {
  USER: "user",
  ADMIN: "admin",
};

// Create regular user
const createUser = async ({
  fullName,
  email,
  password,
  phoneNumber,
  profilePhoto,
}) => {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if email already exists
    const existingUser = await sql`
      SELECT id FROM users WHERE email = ${email};
    `;

    if (existingUser.length > 0) {
      throw new Error("Email already exists");
    }

    // Create user with default role
    const user = await sql`
      INSERT INTO users (
        full_name,
        email,
        password,
        phone_number,
        role,
        status,
        created_at,
        updated_at
      ) VALUES (
        ${fullName},
        ${email},
        ${hashedPassword},
        ${phoneNumber},
        ${UserRoles.USER},
        'active',
        NOW(),
        NOW()
      )
      RETURNING id, full_name, email, phone_number, role, created_at, status;
    `;

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

// Create admin user (requires admin secret key)
const createAdmin = async ({
  fullName,
  email,
  password,
  phoneNumber,
  adminSecretKey,
}) => {
  try {
    // Verify admin secret key
    if (adminSecretKey !== process.env.ADMIN_SECRET_KEY) {
      throw new Error("Invalid admin secret key");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await sql`
      INSERT INTO users (
        full_name,
        email,
        password,
        phone_number,
        role,
        status,
        created_at,
        updated_at
      ) VALUES (
        ${fullName},
        ${email},
        ${hashedPassword},
        ${phoneNumber},
        ${UserRoles.ADMIN},
        'active',
        NOW(),
        NOW()
      )
      RETURNING id, full_name, email, phone_number, role, created_at, status;
    `;

    return admin[0];
  } catch (error) {
    if (error.code === "23505") {
      throw new Error("Email or phone number already exists");
    }
    throw error;
  }
};

// Enhanced login with role-based token generation
const loginUser = async (email, password) => {
  try {
    const user = await sql`
      SELECT id, full_name, email, password, role, status, last_login
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

    // Update last login timestamp
    await sql`
      UPDATE users
      SET last_login = NOW()
      WHERE id = ${user[0].id};
    `;

    // Generate role-based token
    const token = jwt.sign(
      {
        userId: user[0].id,
        email: user[0].email,
        role: user[0].role,
      },
      process.env.JWT_SECRET,
      { expiresIn: user[0].role === UserRoles.ADMIN ? "12h" : "24h" }
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

// Get user by ID (with role check)
const getUserById = async (userId, requestingUserRole) => {
  const user = await sql`
    SELECT id, full_name, email, phone_number, role, status, created_at, updated_at, last_login
    FROM users
    WHERE id = ${userId};
  `;

  if (!user[0]) {
    throw new Error("User not found");
  }

  // If requesting user is not admin and trying to access different user's data
  if (requestingUserRole !== UserRoles.ADMIN && user[0].id !== userId) {
    throw new Error("Unauthorized access");
  }

  return user[0];
};

// Get all users (admin only, with enhanced filtering and pagination)
const getAllUsers = async (filters = {}, page = 1, limit = 10) => {
  const offset = (page - 1) * limit;
  let whereClause = "WHERE 1=1";
  const values = [];

  // Build dynamic where clause based on filters
  if (filters.role) {
    whereClause += ` AND role = $${values.length + 1}`;
    values.push(filters.role);
  }

  if (filters.status) {
    whereClause += ` AND status = $${values.length + 1}`;
    values.push(filters.status);
  }

  if (filters.search) {
    whereClause += ` AND (full_name ILIKE $${
      values.length + 1
    } OR email ILIKE $${values.length + 1})`;
    values.push(`%${filters.search}%`);
  }

  const query = `
    SELECT 
      id, full_name, email, phone_number, role, status, 
      created_at, updated_at, last_login
    FROM users
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${values.length + 1}
    OFFSET $${values.length + 2};
  `;

  values.push(limit, offset);

  const users = await sql.query(query, values);
  const totalUsers = await sql.query(
    `SELECT COUNT(*) FROM users ${whereClause}`,
    values.slice(0, -2)
  );

  return {
    users: users.rows,
    total: parseInt(totalUsers.rows[0].count),
    page,
    totalPages: Math.ceil(totalUsers.rows[0].count / limit),
  };
};

// Enhanced update user with role-based permissions
const updateUser = async (userId, updates, requestingUserRole) => {
  const allowedUpdates = {
    [UserRoles.USER]: ["full_name", "phone_number"],
    [UserRoles.ADMIN]: ["full_name", "phone_number", "email", "status", "role"],
  };

  const updateFields = [];
  const values = [];

  Object.keys(updates).forEach((key) => {
    if (
      allowedUpdates[requestingUserRole].includes(key) &&
      updates[key] !== undefined
    ) {
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
    RETURNING id, full_name, email, phone_number, role, status, updated_at;
  `;

  const result = await sql.query(query, values);
  return result.rows[0];
};

// Enhanced password update with additional security
const updatePassword = async (userId, currentPassword, newPassword) => {
  // Password strength validation
  if (newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }

  const user = await sql`
    SELECT password FROM users WHERE id = ${userId};
  `;

  if (!user[0]) {
    throw new Error("User not found");
  }

  const isValidPassword = await bcrypt.compare(
    currentPassword,
    user[0].password
  );
  if (!isValidPassword) {
    throw new Error("Current password is incorrect");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await sql`
    UPDATE users
    SET 
      password = ${hashedPassword},
      updated_at = NOW(),
      password_changed_at = NOW()
    WHERE id = ${userId}
  `;

  return true;
};

// Delete user (admin only)
const deleteUser = async (userId, requestingUserRole) => {
  if (requestingUserRole !== UserRoles.ADMIN) {
    throw new Error("Unauthorized: Only admins can delete users");
  }

  const result = await sql`
    DELETE FROM users
    WHERE id = ${userId} AND role != ${UserRoles.ADMIN}
    RETURNING id;
  `;

  if (!result[0]) {
    throw new Error("User not found or cannot delete admin users");
  }

  return result[0];
};

module.exports = {
  UserRoles,
  createUser,
  createAdmin,
  loginUser,
  getUserById,
  getAllUsers,
  updateUser,
  updatePassword,
  deleteUser,
};
