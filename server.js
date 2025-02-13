const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');  // Importamos Pool para la conexión a PostgreSQL

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Configuración de la conexión a PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,  // Usamos la variable de entorno para la URL
  ssl: {
    rejectUnauthorized: false, // Asegura el uso de SSL en Railway
  },
});

// Lista base de nombres y colores
const baseNames = ["Barco 1", "Barco 2", "Barco 3", "Barco 4", "Barco 5"];
const availableColors = ["red", "blue", "yellow", "green", "purple"];

let connectedBoats = []; // Lista de barcos conectados en orden
let usedColors = {}; // Mapeo de socket.id -> color

// Función para crear las tablas si no existen
const createTables = async () => {
  try {
    const createBoatsTableQuery = `
      CREATE TABLE IF NOT EXISTS boats (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        color VARCHAR(50)
      );
    `;
    const createLocationsTableQuery = `
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        boat_id INTEGER REFERENCES boats(id) ON DELETE CASCADE,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        azimuth DOUBLE PRECISION NOT NULL,
        speed DOUBLE PRECISION NOT NULL,
        pitch DOUBLE PRECISION,  -- Nueva columna para pitch
        roll DOUBLE PRECISION,   -- Nueva columna para roll
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    // Ejecutar las consultas para crear las tablas
    await pool.query(createBoatsTableQuery);
    await pool.query(createLocationsTableQuery);
    console.log('Tablas creadas o verificadas correctamente');
  } catch (error) {
    console.error('Error al crear las tablas:', error);
  }
};

// Llamamos a la función para crear las tablas cuando el servidor se inicie
createTables();

io.on('connection', (socket) => {
  console.log('Nuevo cliente conectado:', socket.id);

  // Asignar color único
  const color = availableColors.find(c => !Object.values(usedColors).includes(c));
  if (!color) {
    socket.emit('assignBoatInfo', { error: "No hay colores disponibles" });
    return;
  }

  usedColors[socket.id] = color;
  connectedBoats.push(socket.id); // Agregar el ID al final de la lista

  // Reasignar nombres en orden
  reassignBoatNames();

  // Escuchar datos de ubicación del cliente
  socket.on('sendLocation', (data) => {
    const boatInfo = {
      id: socket.id,
      name: getBoatName(socket.id),
      color: usedColors[socket.id],
      ...data,
    };
    console.log('Ubicación recibida:', boatInfo);

    // Guardar la información en la base de datos
    saveLocationToDb(boatInfo);

    // Emitir la ubicación a todos los clientes conectados
    io.emit('updateLocation', boatInfo);
  });

  // Manejar desconexiones
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);

    // Eliminar el barco de las listas
    connectedBoats = connectedBoats.filter(id => id !== socket.id);
    delete usedColors[socket.id];

    // Reasignar nombres en orden
    reassignBoatNames();
  });
});

// Función para reasignar nombres a los barcos en orden
function reassignBoatNames() {
  connectedBoats.forEach((id, index) => {
    const name = baseNames[index];
    if (name) {
      io.to(id).emit('assignBoatInfo', { name, color: usedColors[id] });
      console.log(`Reasignado: ${id} -> ${name}`);
    }
  });
}

// Función para obtener el nombre de un barco por su ID
function getBoatName(id) {
  const index = connectedBoats.indexOf(id);
  return baseNames[index];
}

// Función para guardar la ubicación en la base de datos
const saveLocationToDb = async (boatInfo) => {
  try {
    // Primero registramos el barco si no existe en la base de datos
    const result = await pool.query('SELECT id FROM boats WHERE name = $1', [boatInfo.name]);
    if (result.rows.length === 0) {
      // Si no está registrado, lo registramos
      await pool.query('INSERT INTO boats (name, color) VALUES ($1, $2)', [boatInfo.name, boatInfo.color]);
      console.log(`Barco registrado: ${boatInfo.name}`);
    }

    // Obtener el ID del barco
    const boatId = result.rows[0].id;

    // Guardar la ubicación en la tabla de ubicaciones
    await pool.query(
      'INSERT INTO locations (boat_id, latitude, longitude, azimuth, speed, pitch, roll) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [boatId, boatInfo.latitude, boatInfo.longitude, boatInfo.azimuth, boatInfo.speed, boatInfo.pitch, boatInfo.roll]
    );
    console.log(`Ubicación del barco ${boatInfo.name} guardada`);
  } catch (error) {
    console.error('Error guardando la ubicación:', error);
  }
};

// Iniciar el servidor en el puerto 8080
server.listen(8080, '0.0.0.0', () => {
  console.log('Servidor escuchando en el puerto 8080');
});
