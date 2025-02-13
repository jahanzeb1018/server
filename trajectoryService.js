const fs = require("fs");
const path = require("path");
const io = require("socket.io-client");

// 📌 Conectar con el servidor WebSocket
const socket = io("https://server-production-c33c.up.railway.app/");

// 📌 Ruta del archivo JSON con las posiciones
const jsonFilePath = path.join(__dirname, "data", "boat_positions.json");

// 📌 Leer y parsear el JSON
const loadJsonData = () => {
  try {
    const rawData = fs.readFileSync(jsonFilePath);
    return JSON.parse(rawData);
  } catch (error) {
    console.error("Error cargando JSON:", error);
    return null;
  }
};

// 📌 Función para iniciar la simulación de los barcos
const startBoatSimulation = () => {
  const data = loadJsonData();
  if (!data || !data.positions) return console.error("No hay datos disponibles.");

  Object.entries(data.positions).forEach(([boatName, positions]) => {
    let index = 0;

    const sendNextPosition = () => {
      if (index >= positions.length) return; // Si terminamos el recorrido, salimos

      const position = positions[index];
      const boatInfo = {
        id: boatName,
        name: boatName,
        latitude: position.a, // Latitud
        longitude: position.n, // Longitud
        speed: position.s, // Velocidad
        azimuth: position.c, // Dirección
      };

      console.log(`Enviando datos de ${boatName}:`, boatInfo);
      socket.emit("sendLocation", boatInfo); // 📌 Enviar datos al servidor

      index++;
      setTimeout(sendNextPosition, 100); // 📌 Enviar cada 2 segundos
    };

    sendNextPosition(); // Iniciar el recorrido del barco
  });
};

// 📌 Ejecutar la simulación al iniciar el servicio
startBoatSimulation();
