// server.js (Backend)

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

let boats = {}; // Mantener un objeto de barcos conectados

// Cuando un cliente se conecta
io.on('connection', (socket) => {
  console.log('Nuevo cliente conectado');

  // Recibir la ubicación del barco desde la app móvil y emitirla a todos los clientes
  socket.on('sendLocation', (data) => {
    // Guardamos la ubicación del barco en el objeto de barcos
    boats[socket.id] = data;

    // Emitimos la ubicación a todos los clientes
    io.emit('updateLocation', { id: socket.id, ...data });
  });

  // Cuando un cliente se desconecta
  socket.on('disconnect', () => {
    console.log('Cliente desconectado');
    delete boats[socket.id]; // Eliminar el barco cuando el cliente se desconecta
  });
});

// Iniciar el servidor
server.listen(8080, () => {
  console.log('Servidor escuchando en el puerto 8080');
});
