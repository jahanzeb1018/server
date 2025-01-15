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

app.get('/', (req, res) => {
  res.send('Boat Tracker Server is running');
});

io.on('connection', (socket) => {
  console.log('A client connected');

  socket.on('sendLocation', (data) => {
    console.log('Received location:', data);
    io.emit('updateLocation', data);
  });

  socket.on('disconnect', () => {
    console.log('A client disconnected');
  });
});

// Usa process.env.PORT o el puerto 3000 por defecto
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
