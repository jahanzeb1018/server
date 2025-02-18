const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const { Pool } = require("pg"); // Conexión a PostgreSQL

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Permitir conexiones desde cualquier origen
    methods: ["GET", "POST"]
  }
});

// Conexión a PostgreSQL (Railway)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: {
    rejectUnauthorized: false, // Necesario para conexiones seguras
  }
});

// Crear tablas en PostgreSQL si no existen
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

    console.log("✅ Tablas creadas/verificadas correctamente.");
  } catch (error) {
    console.error("❌ Error al crear tablas:", error);
  }
};

createTables();

// Lista base de nombres y colores asignables
const baseNames = ["Barco 1", "Barco 2", "Barco 3", "Barco 4", "Barco 5"];
const availableColors = ["red", "blue", "yellow", "green", "purple"];

// Estados en memoria (por Socket ID)
let connectedBoats = []; // Array de IDs de sockets que son "barcos"
let usedColors = {};     // Mapeo: socket.id -> color

// Manejo de conexiones de WebSocket
io.on("connection", (socket) => {
  // Leemos el "role" que el cliente nos manda
  const role = socket.handshake.query.role;
  console.log(`🔌 Nuevo cliente conectado: ${socket.id}, role: ${role}`);

  if (role === "boat") {
    // Este socket será gestionado como un BARCO
    console.log("🔵 Conexión identificada como BARCO:", socket.id);

    // Asignar color único al barco
    const color = availableColors.find(c => !Object.values(usedColors).includes(c));
    if (!color) {
      socket.emit("assignBoatInfo", { error: "No hay colores disponibles" });
      return;
    }

    usedColors[socket.id] = color;
    connectedBoats.push(socket.id);

    // Asigna el nombre según el índice (Barco 1, Barco 2...)
    reassignBoatNames();

    // Escucha posición del barco en tiempo real
    socket.on("sendLocation", (data) => {
      const boatInfo = {
        id: socket.id,
        name: getBoatName(socket.id),
        color: usedColors[socket.id],
        ...data,
      };

      console.log("📡 Ubicación recibida:", boatInfo);
      // Guardar en la base de datos
      saveLocationToDb(boatInfo);

      // Reenviar la ubicación a todos los clientes
      io.emit("updateLocation", boatInfo);
    });

    // ---------------------------
    // NUEVO: Reenviar "boatFinished"
    // cuando el barco avise de que terminó su ruta
    // ---------------------------
    socket.on("boatFinished", (data) => {
      console.log(`🚩 Barco finalizó ruta: ${data.name}`);
      io.emit("boatFinished", data);
    });

    // Manejar desconexión
    socket.on("disconnect", () => {
      console.log("🔴 BARCO desconectado:", socket.id);

      // Eliminar de la lista de barcos
      connectedBoats = connectedBoats.filter(id => id !== socket.id);
      delete usedColors[socket.id];

      reassignBoatNames();
    });

  } else {
    // Conexión como "viewer"
    console.log("🟢 Conexión identificada como VIEWER:", socket.id);

    socket.on("disconnect", () => {
      console.log("🟡 VIEWER desconectado:", socket.id);
    });
  }
});

// Reasignar nombres de barcos en orden (según el array connectedBoats)
function reassignBoatNames() {
  connectedBoats.forEach((id, index) => {
    const name = baseNames[index];
    if (name) {
      io.to(id).emit("assignBoatInfo", { name, color: usedColors[id] });
      console.log(`📌 Asignado: ${id} -> ${name}`);
    }
  });
}

// Obtener el nombre de un barco por su ID de socket
function getBoatName(id) {
  const index = connectedBoats.indexOf(id);
  return baseNames[index];
}

// Guardar ubicación en PostgreSQL
const saveLocationToDb = async (boatInfo) => {
  try {
    // Verificar si el barco ya está en la tabla boats (por su "name")
    const result = await pool.query("SELECT id FROM boats WHERE name = $1", [boatInfo.name]);
    
    let boatId;
    if (result.rows.length === 0) {
      // Insertamos en la tabla de barcos
      const insertBoat = await pool.query(
        "INSERT INTO boats (name, color) VALUES ($1, $2) RETURNING id",
        [boatInfo.name, boatInfo.color]
      );
      boatId = insertBoat.rows[0].id;
      console.log(`🚢 Barco registrado: ${boatInfo.name}`);
    } else {
      boatId = result.rows[0].id;
    }

    // Guardar ubicación en la tabla locations
    await pool.query(
      "INSERT INTO locations (boat_id, latitude, longitude, azimuth, speed, pitch, roll) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [
        boatId,
        boatInfo.latitude,
        boatInfo.longitude,
        boatInfo.azimuth,
        boatInfo.speed,
        boatInfo.pitch,
        boatInfo.roll
      ]
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
