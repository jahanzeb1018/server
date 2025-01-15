const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());

// Ruta para verificar que el servidor está corriendo
app.get('/', (req, res) => {
  res.send('Boat Tracker Server is running');
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

  socket.on('disconnect', () => {
    console.log('A client disconnected');
  });
});

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
