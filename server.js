const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');  // Importar cors

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Configuración de CORS para permitir solicitudes desde localhost:3000
app.use(cors({
  origin: "http://localhost:3000",  // Permite solicitudes solo desde http://localhost:3000
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

let boats = {}; // Mantener un objeto de barcos conectados

// Cuando un cliente se conecta
io.on('connection', (socket) => {
  console.log('Nuevo cliente conectado');

  // Recibir la ubicación del barco desde la app móvil y emitirla a todos los clientes
  socket.on('sendLocation', (data) => {
    console.log('Ubicación recibida:', data);
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
