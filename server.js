const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Evento cuando un cliente se conecta
io.on('connection', (socket) => {
  console.log('A client connected');

  // Recibir la ubicación de un barco
  socket.on('sendLocation', (data) => {
    console.log('Received location:', data);

    // Retransmitir la ubicación a todos los clientes conectados
    io.emit('updateLocation', data);
  });

  // Evento cuando un cliente se desconecta
  socket.on('disconnect', () => {
    console.log('A client disconnected');
  });
});

server.listen(2000, () => {
  console.log('Server running on http://localhost:2000');
});
