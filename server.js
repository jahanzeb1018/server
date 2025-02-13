const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const { Pool } = require("pg"); // 📌 Conexión a PostgreSQL

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 📌 Conexión a PostgreSQL (Railway)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 📌 Lista de colores disponibles para los barcos
const availableColors = ["red", "blue", "yellow", "green", "purple", "orange", "pink", "cyan", "brown", "lime"];
let usedColors = {}; // 📌 Mapeo de barco -> color

// 📌 Crear tablas en PostgreSQL si no existen
const createTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS boats (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        color VARCHAR(50) NOT NULL
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
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("✅ Tablas creadas/verificadas correctamente.");
  } catch (error) {
    console.error("❌ Error al crear tablas:", error);
  }
};

// 📌 Llamar a la función al iniciar el servidor
createTables();

// 📌 Manejo de conexiones de WebSocket
io.on("connection", (socket) => {
  console.log("🔵 Nuevo cliente conectado:", socket.id);

  socket.on("sendLocation", async (data) => {
    try {
      let boatColor = usedColors[data.id];

      // 📌 Si el barco no tiene color, asignarle uno único
      if (!boatColor) {
        const existingBoat = await pool.query("SELECT color FROM boats WHERE name = $1", [data.name]);
        
        if (existingBoat.rows.length > 0) {
          boatColor = existingBoat.rows[0].color; // Usar el color de la BD
        } else {
          // 📌 Asignar un color no usado
          boatColor = availableColors.find(c => !Object.values(usedColors).includes(c)) || "gray";
          await pool.query("INSERT INTO boats (name, color) VALUES ($1, $2)", [data.name, boatColor]);
        }
        usedColors[data.id] = boatColor;
      }

      const boatInfo = {
        id: data.id,
        name: data.name,
        color: boatColor,
        latitude: data.latitude,
        longitude: data.longitude,
        azimuth: data.azimuth,
        speed: data.speed
      };

      console.log("📡 Ubicación recibida:", boatInfo);
      io.emit("updateLocation", boatInfo);
    } catch (error) {
      console.error("❌ Error procesando ubicación:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("🔴 Cliente desconectado:", socket.id);
    delete usedColors[socket.id]; // Liberar el color usado
  });
});

// 📌 Iniciar el servidor en Railway
const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor en ejecución en el puerto ${PORT}`);
});
