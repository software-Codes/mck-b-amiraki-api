# Authentication Service

This is the authentication service for the Bishop Amiraki Church backend. It handles user authentication, including login, registration, and token management.

## Features

- User registration
- User login
- JWT token generation and validation
- Password hashing and verification

## Installation

1. Clone the repository:
    ```bash
    git clone https://github.com/your-repo/bishop-amiraki-church-backend.git
    ```
2. Navigate to the auth-service directory:
    ```bash
    cd bishop-amiraki-church-backend/services/auth-service
    ```
3. Install dependencies:
    ```bash
    npm install
    ```

## Usage

1. Start the authentication service:
    ```bash
    npm start
    ```
2. The service will be available at `http://localhost:3000`.

## API Endpoints

- `POST /register` - Register a new user
- `POST /login` - Login a user
- `GET /profile` - Get user profile (requires authentication)

## Environment Variables

- `JWT_SECRET` - Secret key for signing JWT tokens
- `DB_CONNECTION_STRING` - Connection string for the database

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License.