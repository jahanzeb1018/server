const fs = require("fs");
const path = require("path");
const io = require("socket.io-client");

// Conectar con el servidor WebSocket
const socket = io("https://server-production-c33c.up.railway.app", {
  query: { role: "boat" }
});

// Ruta del archivo JSON con las posiciones
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
  if (!data || !data.positions) return console.error("No hay datos disponibles.");

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
        timestamp: position.t // Incluimos el timestamp
      };

      console.log(`Enviando datos de ${boatName}:`, boatInfo);
      socket.emit("sendLocation", boatInfo);

      index++;
      const nextPosition = positions[index];
      if (nextPosition) {
        const delay = nextPosition.t - position.t;
        setTimeout(sendNextPosition, 30); //cambiar el 30 por delay para mostrar a tiempo real
      } 
    };

    // Iniciar la simulación después de un retraso inicial
    const initialDelay = positions[0].t - Date.now();
    setTimeout(sendNextPosition, initialDelay > 0 ? initialDelay : 0);
  });
};

// Ejecutar la simulación al iniciar el servicio
startBoatSimulation();