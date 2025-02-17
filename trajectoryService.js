const fs = require("fs");
const path = require("path");
const io = require("socket.io-client");

// Conectar con el servidor WebSocket
const socket = io("https://server-production-c33c.up.railway.app/");

// Ruta del archivo JSON con las posiciones
const jsonFilePath = path.join(__dirname, "data", "boat_positions.json");

// Colores asignados a los barcos (para evitar repetidos)
const boatColors = {};
const availableColors = [
  "red",
  "blue",
  "yellow",
  "green",
  "purple",
  "orange",
  "pink",
  "cyan",
  "brown",
  "lime",
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
  if (!data || !data.positions)
    return console.error("No hay datos disponibles.");

  Object.entries(data.positions).forEach(([boatName, positions]) => {
    let index = 0;

    // Asignar un color único al barco
    if (!boatColors[boatName]) {
      boatColors[boatName] = availableColors.shift() || "gray";
    }

    const sendNextPosition = () => {
      if (index >= positions.length) return;

      const position = positions[index];
      const boatInfo = {
        id: boatName,
        name: boatName,
        color: boatColors[boatName],
        latitude: position.a,
        longitude: position.n,
        speed: position.s,
        azimuth: position.c,
      };

      console.log(`Enviando datos de ${boatName}:`, boatInfo);
      socket.emit("sendLocation", boatInfo);

      index++;
      setTimeout(sendNextPosition, 30); // Velocidad de envío
    };

    sendNextPosition();
  });
};

// Ejecutar la simulación al iniciar el servicio
startBoatSimulation();
