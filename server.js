// server.js
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const { Pool } = require("pg"); // Conexión a PostgreSQL

const app = express();

// 🔹 Habilitar CORS solo para tu frontend
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

// Crear tablas en PostgreSQL si no existen
const createTables = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS boats (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                color VARCHAR(50)
            );
        `);

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

        console.log("✅ Tablas creadas/verificadas correctamente.");
    } catch (error) {
        console.error("❌ Error al crear tablas:", error);
    }
};

createTables();

let connectedBoats = [];
let usedColors = {};
let globalBuoys = [];

io.on("connection", (socket) => {
    const role = socket.handshake.query.role;
    console.log(`🔌 Nuevo cliente conectado: ${socket.id}, role: ${role}`);

    socket.on("sendBuoys", (buoys) => {
        console.log("Servidor recibió boyas:", buoys);
        globalBuoys = buoys;
        io.emit("buoys", buoys);
    });

    if (role === "boat") {
        console.log("🔵 Conexión identificada como BARCO:", socket.id);

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

function reassignBoatNames() {
    connectedBoats.forEach((id, index) => {
        const name = ["Barco 1", "Barco 2", "Barco 3", "Barco 4", "Barco 5"][index];
        if (name) {
            io.to(id).emit("assignBoatInfo", { name, color: usedColors[id] });
            console.log(`📌 Asignado: ${id} -> ${name}`);
        }
    });
}

function getBoatName(id) {
    const index = connectedBoats.indexOf(id);
    return ["Barco 1", "Barco 2", "Barco 3", "Barco 4", "Barco 5"][index];
}

const saveLocationToDb = async (boatInfo) => {
    try {
        const result = await pool.query("SELECT id FROM boats WHERE name = $1", [boatInfo.name]);
        
        let boatId;
        if (result.rows.length === 0) {
            const insertBoat = await pool.query(
                "INSERT INTO boats (name, color) VALUES ($1, $2) RETURNING id",
                [boatInfo.name, boatInfo.color]
            );
            boatId = insertBoat.rows[0].id;
            console.log(`🚢 Barco registrado: ${boatInfo.name}`);
        } else {
            boatId = result.rows[0].id;
        }

        await pool.query(
            "INSERT INTO locations (boat_id, latitude, longitude, azimuth, speed, pitch, roll) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            [boatId, boatInfo.latitude, boatInfo.longitude, boatInfo.azimuth, boatInfo.speed, boatInfo.pitch, boatInfo.roll]
        );

        console.log(`📍 Ubicación del barco ${boatInfo.name} guardada.`);
    } catch (error) {
        console.error("❌ Error guardando ubicación:", error);
    }
};

// Iniciar el servidor en Railway
const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor en ejecución en el puerto ${PORT}`);
});
