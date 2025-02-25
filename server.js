/********************************************
 * server.js (versión simplificada)
 ********************************************/
require("dotenv").config(); // Solo si usas variables de entorno locales

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Configurar conexión a PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: {
    rejectUnauthorized: false, // Para Railway
  },
});

/**
 * Crear tabla "users" si no existe.
 * - id SERIAL PRIMARY KEY
 * - username VARCHAR(50) NOT NULL
 * - email VARCHAR(100) UNIQUE NOT NULL
 * - password VARCHAR(255) NOT NULL
 */
const createTableIfNotExists = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL
      );
    `);
    console.log("✅ Tabla 'users' creada/verificada correctamente.");
  } catch (error) {
    console.error("❌ Error al crear/verificar tabla 'users':", error);
  }
};

// Llamamos a la creación/verificación de la tabla al iniciar el servidor
createTableIfNotExists();

/**
 * RUTA: Registro de usuario
 * ENDPOINT: POST /register
 * BODY (JSON): { "username": "...", "email": "...", "password": "..." }
 */
app.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Verificar campos obligatorios
    if (!username || !email || !password) {
      return res
        .status(400)
        .json({ error: "Por favor, completa todos los campos requeridos." });
    }

    // Verificar si el email ya está en uso
    const existingUser = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "El email ya está registrado." });
    }

    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insertar el nuevo usuario en la base de datos
    await pool.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3)",
      [username, email, hashedPassword]
    );

    return res.status(201).json({ message: "Usuario registrado con éxito." });
  } catch (error) {
    console.error("❌ Error en /register:", error);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
});

/**
 * RUTA: Inicio de sesión
 * ENDPOINT: POST /login
 * BODY (JSON): { "email": "...", "password": "..." }
 */
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Verificar campos
    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Por favor, proporciona email y contraseña." });
    }

    // Buscar el usuario por email
    const userResult = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: "Email o contraseña incorrectos." });
    }

    const user = userResult.rows[0];

    // Comparar la contraseña con la almacenada (hasheada)
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Email o contraseña incorrectos." });
    }

    // Si pasa la verificación, el login es exitoso
    // Aquí podrías generar un token (JWT) si quisieras manejar sesiones seguras
    // Para el ejemplo, solo devolvemos un mensaje
    return res.status(200).json({
      message: "Inicio de sesión exitoso.",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("❌ Error en /login:", error);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
});

// Iniciar el servidor
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
});
