const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const { Pool } = require("pg"); // 📌 Conexión a PostgreSQL

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Permitir conexiones desde cualquier origen
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

// 📌 Lista de barcos y colores asignados
const baseNames = ["Barco 1", "Barco 2", "Barco 3", "Barco 4", "Barco 5"];
const availableColors = ["red", "blue", "yellow", "green", "purple"];
let connectedBoats = []; // 📌 Lista de barcos conectados
let usedColors = {}; // 📌 Mapeo de socket.id -> color

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

  // 📌 Asignar color único al barco
  const color = availableColors.find(c => !Object.values(usedColors).includes(c));
  if (!color) {
    socket.emit("assignBoatInfo", { error: "No hay colores disponibles" });
    return;
  }

  usedColors[socket.id] = color;
  connectedBoats.push(socket.id);

  // 📌 Asignar nombres en orden
  reassignBoatNames();

  // 📌 Escuchar posiciones de los barcos en tiempo real
  socket.on("sendLocation", (data) => {
    const boatInfo = {
      id: socket.id,
      name: getBoatName(socket.id),
      color: usedColors[socket.id],
      ...data,
    };

    console.log("📡 Ubicación recibida:", boatInfo);
    saveLocationToDb(boatInfo); // 📌 Guardar en la base de datos

    io.emit("updateLocation", boatInfo); // 📌 Reenviar a todos los clientes
  });

  // 📌 Manejar desconexiones
  socket.on("disconnect", () => {
    console.log("🔴 Cliente desconectado:", socket.id);

    // 📌 Eliminar barco desconectado
    connectedBoats = connectedBoats.filter(id => id !== socket.id);
    delete usedColors[socket.id];

    reassignBoatNames();
  });
});

// 📌 Reasignar nombres de barcos en orden
function reassignBoatNames() {
  connectedBoats.forEach((id, index) => {
    const name = baseNames[index];
    if (name) {
      io.to(id).emit("assignBoatInfo", { name, color: usedColors[id] });
      console.log(`📌 Asignado: ${id} -> ${name}`);
    }
  });
}

// 📌 Obtener nombre de un barco por su ID
function getBoatName(id) {
  const index = connectedBoats.indexOf(id);
  return baseNames[index];
}

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
