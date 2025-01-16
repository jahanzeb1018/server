const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(cors({
  origin: "http://192.168.1.138:3000", // Permitir solicitudes solo desde esta URL
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

// Lista base de nombres y colores
const baseNames = ["Barco 1", "Barco 2", "Barco 3", "Barco 4", "Barco 5"];
const availableColors = ["red", "blue", "yellow", "green", "purple"];

let connectedBoats = []; // Lista de barcos conectados en orden
let usedColors = {}; // Mapeo de socket.id -> color

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

server.listen(8080, '0.0.0.0', () => {
  console.log('Servidor escuchando en el puerto 8080');
});
