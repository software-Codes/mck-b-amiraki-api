const { sql } = require("../config/database");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const emailService = require("../services/nodemailer");
//generate 6-code verification code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

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
//upload profile photo
const uploadProfilePhoto = async (userId, file) => {
  try {
    // Update the user's profile photo path in the database
    const user = await sql`
      UPDATE users 
      SET 
        profile_photo = ${file.path},
        updated_at = NOW()
      WHERE id = ${userId}
      RETURNING id, full_name, email, phone_number, profile_photo, role, status;
    `;

    if (!user[0]) {
      throw new Error("User not found");
    }

    return user[0];
  } catch (error) {
    throw error;
  }
};

// Create admin user with verification
const createAdmin = async ({
  fullName,
  email,
  password,
  phoneNumber,
  is_super_admin = false,
}) => {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationCode = generateVerificationCode();
    const verificationExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Create unverified admin
    const admin = await sql`
      INSERT INTO users (
        full_name,
        email,
        password,
        phone_number,
        role,
        status,
        is_super_admin,
        verification_code,
        verification_code_expires_at,
        created_at,
        updated_at
      ) VALUES (
        ${fullName},
        ${email},
        ${hashedPassword},
        ${phoneNumber},
        ${UserRoles.ADMIN},
        'pending',
        ${is_super_admin},
        ${verificationCode},
        ${verificationExpiry},
        NOW(),
        NOW()
      )
      RETURNING id, full_name, email, phone_number, role, status;
    `;

    // Send verification code
    await emailService.sendVerificationCode(email, verificationCode);

    return admin[0]; // Return the first row of the result
  } catch (error) {
    if (error.code === "23505") {
      throw new Error("Email or phone number already exists");
    }
    throw error;
  }
};
// Verify admin account
const verifyAdminAccount = async (email, verificationCode) => {
  try {
    const admin = await sql`
      SELECT id, verification_code, verification_code_expires_at
      FROM users
      WHERE email = ${email}
      AND role = ${UserRoles.ADMIN}
      AND status = 'pending';
    `;

    if (!admin[0]) {
      throw new Error("Invalid verification attempt");
    }

    if (new Date() > new Date(admin[0].verification_code_expires_at)) {
      throw new Error("Verification code has expired");
    }

    if (admin[0].verification_code !== verificationCode) {
      throw new Error("Invalid verification code");
    }
    // Activate admin account
    const verifiedAdmin = await sql`
        UPDATE users
        SET 
          status = 'active',
          verification_code = null,
          verification_code_expires_at = null,
          updated_at = NOW()
        WHERE id = ${admin[0].id}
        RETURNING id, full_name, email, phone_number, role, status;
      `;

    return verifiedAdmin[0];
  } catch (error) {
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

    // Clear any previous token invalidation timestamp
    await sql`
      UPDATE users
      SET 
        last_login = NOW(),
        token_invalidated_at = null
      WHERE id = ${user[0].id};
    `;

    const issuedAt = Math.floor(Date.now() / 1000);
    
    // Generate role-based token with issued timestamp
    const token = jwt.sign(
      {
        userId: user[0].id,
        email: user[0].email,
        role: user[0].role,
        iat: issuedAt
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

// Update the updateUser function to handle profile photo

const updateUser = async (userId, updates, requestingUserRole) => {
  try {
    const allowedUpdates = {
      [UserRoles.USER]: ["full_name", "phone_number"],
      [UserRoles.ADMIN]: ["full_name", "phone_number", "status", "role"],
    };

    // Handle profile photo separately
    if (updates.profilePhoto) {
      await uploadProfilePhoto(userId, updates.profilePhoto);
      delete updates.profilePhoto;
    }

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

    if (updateFields.length === 0) {
      throw new Error("No valid fields to update or permission denied");
    }

    values.push(userId);

    const query = `
      UPDATE users 
      SET ${updateFields.join(", ")}, updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING id, full_name, phone_number, profile_photo, role, status, updated_at;
    `;

    const result = await sql.query(query, values);

    if (result.rowCount === 0) {
      throw new Error("User not found or update failed");
    }

    return result.rows[0];
  } catch (error) {
    throw error;
  }
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

// Delete user (self or admin)
const deleteUser = async (userId) => {
  try {
    // Verify the user exists
    const userToDelete = await sql`
      SELECT id FROM users WHERE id = ${userId}
    `;

    if (!userToDelete[0]) {
      throw new Error("User not found");
    }

    // Proceed to delete the user
    const result = await sql`
      DELETE FROM users
      WHERE id = ${userId}
      RETURNING id;
    `;

    if (!result[0]) {
      throw new Error("User deletion failed");
    }

    return {
      success: true,
      message: "User account successfully deleted",
      deletedUserId: result[0].id,
    };
  } catch (error) {
    throw error;
  }
};
// Logout user and manage token invalidation
const logoutUser = async (userId) => {
  try {
    // First, verify the user exists
    const user = await sql`
      SELECT id FROM users WHERE id = ${userId}
    `;

    if (!user || user.length === 0) {
      throw new Error('User not found');
    }

    // Generate a new token invalidation timestamp
    const tokenInvalidationTimestamp = new Date();

    // Update the user's logout status and token invalidation timestamp
    const result = await sql`
      UPDATE users
      SET 
        last_logout = NOW(),
        token_invalidated_at = ${tokenInvalidationTimestamp}
      WHERE id = ${userId}
      RETURNING id, last_logout, token_invalidated_at;
    `;

    if (!result || result.length === 0) {
      throw new Error('Failed to update user logout status');
    }

    return {
      success: true,
      message: "Logout successful",
      userId: result[0].id,
      logoutTimestamp: result[0].last_logout,
      tokenInvalidatedAt: result[0].token_invalidated_at
    };
  } catch (error) {
    throw new Error(`Failed to log out user: ${error.message}`);
  }
};


// Add this function to verify token validity against logout timestamp
const verifyTokenValidity = async (userId, tokenIssuedAt) => {
  try {
    const user = await sql`
      SELECT token_invalidated_at
      FROM users
      WHERE id = ${userId}
    `;

    if (!user || user.length === 0) {
      return false;
    }

    // If there's no invalidation timestamp, token is valid
    if (!user[0].token_invalidated_at) {
      return true;
    }

    // Check if token was issued before the invalidation timestamp
    const tokenDate = new Date(tokenIssuedAt * 1000); // Convert Unix timestamp to Date
    return tokenDate > user[0].token_invalidated_at;
  } catch (error) {
    throw new Error(`Failed to verify token validity: ${error.message}`);
  }
};
module.exports = {
  UserRoles,
  createUser,
  createAdmin,
  verifyAdminAccount,
  loginUser,
  getUserById,
  getAllUsers,
  updateUser,
  updatePassword,
  deleteUser,
  logoutUser,
  verifyTokenValidity
};
