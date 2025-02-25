/***********************************************
 * server.js
 ***********************************************/
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const { Pool } = require("pg"); 
const bcrypt = require("bcrypt"); // <-- para hashear contraseñas

const app = express();

// 🔹 Para parsear JSON en los endpoints /register y /login
app.use(express.json());

// 🔹 Habilitar CORS solo para tu frontend (ajusta la URL si necesitas)
app.use(cors({
    origin: "https://jahanzeb1018.github.io",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true
}));

const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: "https://jahanzeb1018.github.io",
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"],
        credentials: true
    },
    transports: ["websocket", "polling"], // 🔹 Forzar uso de WebSockets
});

// Conexión a PostgreSQL en Railway
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

/**
 * Crear tablas en PostgreSQL si no existen
 * (boats, locations) + añadimos una tabla "users" para registro/login.
 */
const createTables = async () => {
    try {
        // Tabla de barcos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS boats (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                color VARCHAR(50)
            );
        `);

        // Tabla de ubicaciones
        await pool.query(`
            CREATE TABLE IF NOT EXISTS locations (
                id SERIAL PRIMARY KEY,
                boat_id INTEGER REFERENCES boats(id) ON DELETE CASCADE,
                latitude DOUBLE PRECISION NOT NULL,
                longitude DOUBLE PRECISION NOT NULL,
                azimuth DOUBLE PRECISION NOT NULL,
                speed DOUBLE PRECISION NOT NULL,
                pitch DOUBLE PRECISION,
                roll DOUBLE PRECISION,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Tabla de usuarios
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL
            );
        `);

        console.log("✅ Tablas creadas/verificadas correctamente.");
    } catch (error) {
        console.error("❌ Error al crear tablas:", error);
    }
};

createTables();

/*************************************************
 * Lógica de websockets (barcos, boyas, etc.)
 *************************************************/

let connectedBoats = [];
let usedColors = {};
let globalBuoys = [];

io.on("connection", (socket) => {
    const role = socket.handshake.query.role;
    console.log(`🔌 Nuevo cliente conectado: ${socket.id}, role: ${role}`);

    // Manejo de boyas
    socket.on("sendBuoys", (buoys) => {
        console.log("Servidor recibió boyas:", buoys);
        globalBuoys = buoys;
        io.emit("buoys", buoys);
    });

    // Si el cliente es un barco
    if (role === "boat") {
        console.log("🔵 Conexión identificada como BARCO:", socket.id);

        // Asignar color disponible
        const color = ["red", "blue", "yellow", "green", "purple"]
            .find(c => !Object.values(usedColors).includes(c));

        if (!color) {
            socket.emit("assignBoatInfo", { error: "No hay colores disponibles" });
            return;
        }

        usedColors[socket.id] = color;
        connectedBoats.push(socket.id);
        reassignBoatNames();

        socket.on("sendLocation", (data) => {
            const boatInfo = {
                id: socket.id,
                name: getBoatName(socket.id),
                color: usedColors[socket.id],
                ...data,
            };

            console.log("📡 Ubicación recibida:", boatInfo);
            saveLocationToDb(boatInfo);
            io.emit("updateLocation", boatInfo);
        });

        socket.on("boatFinished", (data) => {
            console.log(`🚩 Barco finalizó ruta: ${data.name}`);
            io.emit("boatFinished", data);
        });

        socket.on("disconnect", () => {
            console.log("🔴 BARCO desconectado:", socket.id);
            connectedBoats = connectedBoats.filter(id => id !== socket.id);
            delete usedColors[socket.id];
            reassignBoatNames();
        });

    // Si el cliente es un viewer
    } else {
        console.log("🟢 Conexión identificada como VIEWER:", socket.id);

        if (globalBuoys.length > 0) {
            socket.emit("buoys", globalBuoys);
        }

        socket.on("disconnect", () => {
            console.log("🟡 VIEWER desconectado:", socket.id);
        });
    }
});

/** Reasigna los nombres de barcos según el orden de conexión */
function reassignBoatNames() {
    connectedBoats.forEach((id, index) => {
        const name = ["Barco 1", "Barco 2", "Barco 3", "Barco 4", "Barco 5"][index];
        if (name) {
            io.to(id).emit("assignBoatInfo", { name, color: usedColors[id] });
            console.log(`📌 Asignado: ${id} -> ${name}`);
        }
    });
}

/** Obtiene el nombre del barco a partir de su índice en connectedBoats */
function getBoatName(id) {
    const index = connectedBoats.indexOf(id);
    return ["Barco 1", "Barco 2", "Barco 3", "Barco 4", "Barco 5"][index];
}

/** Guarda la ubicación en la base de datos (tabla "locations") */
async function saveLocationToDb(boatInfo) {
    try {
        // Verificar si el barco ya existe en la tabla boats
        const result = await pool.query("SELECT id FROM boats WHERE name = $1", [boatInfo.name]);
        
        let boatId;
        if (result.rows.length === 0) {
            // Insertamos el barco
            const insertBoat = await pool.query(
                "INSERT INTO boats (name, color) VALUES ($1, $2) RETURNING id",
                [boatInfo.name, boatInfo.color]
            );
            boatId = insertBoat.rows[0].id;
            console.log(`🚢 Barco registrado: ${boatInfo.name}`);
        } else {
            boatId = result.rows[0].id;
        }

        // Insertar ubicación en "locations"
        await pool.query(
            "INSERT INTO locations (boat_id, latitude, longitude, azimuth, speed, pitch, roll) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            [boatId, boatInfo.latitude, boatInfo.longitude, boatInfo.azimuth, boatInfo.speed, boatInfo.pitch, boatInfo.roll]
        );

        console.log(`📍 Ubicación del barco ${boatInfo.name} guardada.`);
    } catch (error) {
        console.error("❌ Error guardando ubicación:", error);
    }
}

/*************************************************
 * ENDPOINTS PARA REGISTRO E INICIO DE SESIÓN
 *************************************************/

/**
 * POST /register
 * Body: { username, email, password }
 */
app.post("/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Validar campos
        if (!username || !email || !password) {
            return res.status(400).json({ error: "Faltan datos en el formulario." });
        }

        // Verificar si el email ya existe
        const checkUser = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
        if (checkUser.rows.length > 0) {
            return res.status(400).json({ error: "El email ya está registrado." });
        }

        // Hashear contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insertar nuevo usuario
        await pool.query(
            "INSERT INTO users (username, email, password) VALUES ($1, $2, $3)",
            [username, email, hashedPassword]
        );

        return res.status(201).json({ message: "Usuario registrado correctamente." });
    } catch (error) {
        console.error("Error en /register:", error);
        return res.status(500).json({ error: "Error interno del servidor." });
    }
});

/**
 * POST /login
 * Body: { email, password }
 */
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validar campos
        if (!email || !password) {
            return res.status(400).json({ error: "Faltan campos (email o contraseña)." });
        }

        // Buscar usuario por email
        const userResult = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (userResult.rows.length === 0) {
            return res.status(400).json({ error: "Email o contraseña incorrectos." });
        }

        const user = userResult.rows[0];

        // Comparar contraseña hasheada
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: "Email o contraseña incorrectos." });
        }

        // Login exitoso (aquí podrías generar un token JWT si deseas)
        return res.status(200).json({
            message: "Inicio de sesión exitoso",
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
            }
        });
    } catch (error) {
        console.error("Error en /login:", error);
        return res.status(500).json({ error: "Error interno del servidor." });
    }
});

/*************************************************
 * Iniciar el servidor en Railway
 *************************************************/
const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor en ejecución en el puerto ${PORT}`);
});
