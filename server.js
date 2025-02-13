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
  connectionString: process.env.DATABASE_URL, // 📌 Usa Railway para la DB
  ssl: {
    rejectUnauthorized: false, // 📌 Necesario para conexiones seguras
  }
});

// 📌 Lista de nombres y colores disponibles
const baseNames = ["Barco 1", "Barco 2", "Barco 3", "Barco 4", "Barco 5", "Barco 6", "Barco 7", "Barco 8"];
const availableColors = ["red", "blue", "yellow", "green", "purple", "orange", "cyan", "pink"];
let connectedBoats = {}; // 📌 Mapeo de barcos { socketId: { name, color } }

// 📌 Crear tablas en PostgreSQL si no existen
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

// 📌 Llamar a la función al iniciar el servidor
createTables();

// 📌 Manejo de conexiones de WebSocket
io.on("connection", (socket) => {
  console.log("🔵 Nuevo cliente conectado:", socket.id);

  // 📌 Asignar un color único al barco
  const assignedColor = availableColors.find(color => 
    !Object.values(connectedBoats).some(boat => boat.color === color)
  ) || "gray"; // Si no quedan colores, usar "gray"

  const boatName = baseNames[Object.keys(connectedBoats).length % baseNames.length] || `Barco ${Object.keys(connectedBoats).length + 1}`;

  connectedBoats[socket.id] = { id: socket.id, name: boatName, color: assignedColor };

  // 📌 Notificar al barco su nombre y color
  socket.emit("assignBoatInfo", connectedBoats[socket.id]);

  // 📌 Escuchar y retransmitir las ubicaciones de los barcos
  socket.on("sendLocation", (data) => {
    if (!connectedBoats[socket.id]) return; // Si el barco no está registrado, ignorar

    const boatInfo = {
      id: socket.id,
      name: connectedBoats[socket.id].name,
      color: connectedBoats[socket.id].color,
      latitude: data.latitude,
      longitude: data.longitude,
      speed: data.speed,
      azimuth: data.azimuth
    };

    console.log("📡 Ubicación recibida:", boatInfo);
    saveLocationToDb(boatInfo);
    io.emit("updateLocation", boatInfo); // 📌 Reenviar a todos los clientes
  });

  // 📌 Manejar desconexiones
  socket.on("disconnect", () => {
    console.log("🔴 Cliente desconectado:", socket.id);
    delete connectedBoats[socket.id]; // 📌 Eliminar barco del registro
  });
});

// 📌 Guardar ubicación en PostgreSQL
const saveLocationToDb = async (boatInfo) => {
  try {
    const result = await pool.query("SELECT id FROM boats WHERE name = $1", [boatInfo.name]);
    
    let boatId;
    if (result.rows.length === 0) {
      const insertBoat = await pool.query("INSERT INTO boats (name, color) VALUES ($1, $2) RETURNING id", [boatInfo.name, boatInfo.color]);
      boatId = insertBoat.rows[0].id;
      console.log(`🚢 Barco registrado: ${boatInfo.name}`);
    } else {
      boatId = result.rows[0].id;
    }

    // 📌 Guardar ubicación en la tabla de ubicaciones
    await pool.query(
      "INSERT INTO locations (boat_id, latitude, longitude, azimuth, speed, pitch, roll) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [boatId, boatInfo.latitude, boatInfo.longitude, boatInfo.azimuth, boatInfo.speed, boatInfo.pitch, boatInfo.roll]
    );

    console.log(`📍 Ubicación del barco ${boatInfo.name} guardada.`);
  } catch (error) {
    console.error("❌ Error guardando ubicación:", error);
  }
};

// 📌 Iniciar el servidor en Railway
const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor en ejecución en el puerto ${PORT}`);
});
