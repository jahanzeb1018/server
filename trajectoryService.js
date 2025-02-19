// trajectoryService.js
const fs = require("fs");
const path = require("path");
const io = require("socket.io-client");

// Conectar con el servidor WebSocket
const socket = io("https://server-production-c33c.up.railway.app", {
  query: { role: "boat" }
});

// Ruta del archivo JSON con las posiciones y boyas
const jsonFilePath = path.join(__dirname, "data", "boat_positions.json");

// Colores asignados a los barcos (para evitar repetidos)
const boatColors = {};
const availableColors = [
  "red", "blue", "yellow", "green", "purple", 
  "orange", "pink", "cyan", "brown", "lime"
];

// Leer y parsear el JSON
const loadJsonData = () => {
  try {
    const rawData = fs.readFileSync(jsonFilePath);
    return JSON.parse(rawData);
  } catch (error) {
    console.error("Error cargando JSON:", error);
    return null;
  }
};

// Función para iniciar la simulación de los barcos
const startBoatSimulation = () => {
  const data = loadJsonData();
  if (!data) return console.error("No hay datos disponibles en boat_positions.json.");

  // 1. Enviar boyas al servidor (solo si existen en el JSON)
  if (data.buoys && data.buoys.length > 0) {
    console.log("Enviando boyas al servidor...");
    socket.emit("sendBuoys", data.buoys);
  }

  // 2. Procesar las posiciones de los barcos
  if (!data.positions) return console.error("No hay 'positions' en el archivo JSON.");

  Object.entries(data.positions).forEach(([boatName, positions]) => {
    let index = 0;

    // Asignar un color único al barco si no tiene
    if (!boatColors[boatName]) {
      boatColors[boatName] = availableColors.shift() || "gray";
    }

    const sendNextPosition = () => {
      if (index >= positions.length) {
        // Emitir evento "boatFinished" cuando el barco ya no envía más posiciones
        socket.emit("boatFinished", { name: boatName });
        return;
      }

      const position = positions[index];
      const boatInfo = {
        id: boatName,
        name: boatName,
        color: boatColors[boatName],
        latitude: position.a,
        longitude: position.n,
        speed: position.s,
        azimuth: position.c,
        timestamp: position.t // timestamp
      };

      console.log(`Enviando datos de ${boatName}:`, boatInfo);
      socket.emit("sendLocation", boatInfo);

      index++;
      const nextPosition = positions[index];
      if (nextPosition) {
        const delay = nextPosition.t - position.t;
        // Para simular en tiempo real usa "delay",
        // aquí lo reducimos a 30 ms para una demo rápida:
        setTimeout(sendNextPosition, 30);
      }
    };

    // Iniciar la simulación
    if (positions.length > 0) {
      // Omitimos el cálculo de "initialDelay" si no lo necesitas
      sendNextPosition();
    }
  });
};

// Ejecutar la simulación al iniciar el servicio
startBoatSimulation();
