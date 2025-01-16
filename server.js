const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(cors({
  origin: "http://192.168.1.138:3000", 
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

// Listas de nombres y colores disponibles
const availableNames = ["Barco 1", "Barco 2", "Barco 3", "Barco 4", "Barco 5"];
const availableColors = ["red", "blue", "yellow", "green", "purple"];
let usedNames = {};
let usedColors = {};

io.on('connection', (socket) => {
  console.log('Nuevo cliente conectado');

  // Asignar nombre y color únicos al cliente
  const name = availableNames.find(n => !Object.values(usedNames).includes(n));
  const color = availableColors.find(c => !Object.values(usedColors).includes(c));

  if (name && color) {
    usedNames[socket.id] = name;
    usedColors[socket.id] = color;

    // Emitir el nombre y color asignados al cliente
    socket.emit('assignBoatInfo', { name, color });
  } else {
    socket.emit('assignBoatInfo', { error: "No hay nombres o colores disponibles" });
  }

  // Recibir la ubicación del barco
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
    console.log('Cliente desconectado');
    delete usedNames[socket.id];
    delete usedColors[socket.id];
  });
});

server.listen(8080, '0.0.0.0', () => {
  console.log('Servidor escuchando en el puerto 8080');
});
