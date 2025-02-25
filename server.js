// server.js
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const { Pool } = require("pg"); // Conexión a PostgreSQL
const bcrypt = require("bcrypt"); // Para encriptar contraseñas

const app = express();

// Habilitar CORS solo para tu frontend
app.use(cors({
    origin: "https://jahanzeb1018.github.io",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));

app.use(express.json()); // Para parsear JSON en las solicitudes
app.options("*", cors());
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: "https://jahanzeb1018.github.io",
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"],
        credentials: true
    },
    transports: ["websocket", "polling"], // Forzar uso de WebSockets
});

// Conexión a PostgreSQL en Railway
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Crear tablas en PostgreSQL si no existen
const createTables = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL
            );
        `);

        console.log("✅ Tabla de usuarios creada/verificada correctamente.");
    } catch (error) {
        console.error("❌ Error al crear tablas:", error);
    }
};

createTables();

// Ruta para registrar un nuevo usuario
app.post("/register", async (req, res) => {
    const { username, email, password } = req.body;

    try {
        // Verificar si el email ya está registrado
        const emailCheck = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (emailCheck.rows.length > 0) {
            return res.status(400).json({ error: "El email ya está registrado" });
        }

        // Encriptar la contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insertar el nuevo usuario en la base de datos
        const result = await pool.query(
            "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email",
            [username, email, hashedPassword]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("❌ Error al registrar usuario:", error);
        res.status(500).json({ error: "Error al registrar usuario" });
    }
});

// Ruta para iniciar sesión
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        // Buscar el usuario por email
        const user = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (user.rows.length === 0) {
            return res.status(400).json({ error: "Email o contraseña incorrectos" });
        }

        // Verificar la contraseña
        const validPassword = await bcrypt.compare(password, user.rows[0].password);
        if (!validPassword) {
            return res.status(400).json({ error: "Email o contraseña incorrectos" });
        }

        // Devolver la información del usuario (sin la contraseña)
        const { id, username, email: userEmail } = user.rows[0];
        res.status(200).json({ id, username, email: userEmail });
    } catch (error) {
        console.error("❌ Error al iniciar sesión:", error);
        res.status(500).json({ error: "Error al iniciar sesión" });
    }
});

// Iniciar el servidor en Railway
const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor en ejecución en el puerto ${PORT}`);
});