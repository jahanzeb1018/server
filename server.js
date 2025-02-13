const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Permitir conexiones de cualquier origen
  },
});

app.use(cors());

// 📌 Cargar los datos del JSON
const jsonData = JSON.parse(fs.readFileSync("data.json", "utf8")).positions;
const boatNames = Object.keys(jsonData);

let boatIndexes = {}; // Mantiene el índice de cada barco en su recorrido

// Inicializar los barcos
boatNames.forEach((boat) => {
  boatIndexes[boat] = 0;
});

// 📌 Función para enviar datos de ubicación cada X tiempo
const updateBoatPositions = () => {
  boatNames.forEach((boat) => {
    const positions = jsonData[boat];
    if (boatIndexes[boat] < positions.length) {
      const data = positions[boatIndexes[boat]];

      // 📌 Formato compatible con el cliente
      const boatData = {
        id: boat, // ID del barco
        latitude: data.a, // Latitud
        longitude: data.n, // Longitud
        speed: data.s, // Velocidad
        azimuth: data.c, // Dirección del barco
      };

      console.log(`Enviando datos para ${boat}:`, boatData);
      io.emit("updateLocation", boatData);

      boatIndexes[boat]++; // Pasar al siguiente punto del recorrido
    }
  });
};

// 📌 Enviar posiciones cada 2 segundos
setInterval(updateBoatPositions, 2000);

server.listen(8080, () => {
  console.log("Servidor ejecutándose en el puerto 8080");
});
