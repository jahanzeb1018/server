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

// Listas de nombres y colores disponibles
const availableNames = ["Barco 1", "Barco 2", "Barco 3", "Barco 4", "Barco 5"];
const availableColors = ["red", "blue", "yellow", "green", "purple"];
let usedNames = {}; // Mapeo de socket.id -> nombre
let usedColors = {}; // Mapeo de socket.id -> color

io.on('connection', (socket) => {
  console.log('Nuevo cliente conectado:', socket.id);

  // Asignar un nombre y color únicos
  const name = availableNames.find(n => !Object.values(usedNames).includes(n));
  const color = availableColors.find(c => !Object.values(usedColors).includes(c));

  if (name && color) {
    usedNames[socket.id] = name;
    usedColors[socket.id] = color;

    // Enviar la información asignada al cliente
    socket.emit('assignBoatInfo', { name, color });
  } else {
    socket.emit('assignBoatInfo', { error: "No hay nombres o colores disponibles" });
  }

  // Escuchar datos de ubicación del cliente
  socket.on('sendLocation', (data) => {
    const boatInfo = {
      id: socket.id,
      name: usedNames[socket.id],
      color: usedColors[socket.id],
      ...data,
    };
    console.log('Ubicación recibida:', boatInfo);
    io.emit('updateLocation', boatInfo);
  });

  // Manejar desconexiones
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
    delete usedNames[socket.id]; // Liberar el nombre
    delete usedColors[socket.id]; // Liberar el color
  });
});

server.listen(8080, '0.0.0.0', () => {
  console.log('Servidor escuchando en el puerto 8080');
});
