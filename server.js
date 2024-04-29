const chokidar = require("chokidar");
const mongoose = require("mongoose");
const express = require("express");
const http = require("http");
const dotenv = require("dotenv");
const cors = require("cors");
const socketIO = require("socket.io");

// Load environment variables
dotenv.config();

// Ensure MongoDB URI and PORT are set
const MONGODB_URI = process.env.MONGODB_URI;
const PORT = process.env.PORT || 3000;

if (!MONGODB_URI) {
  console.error("Error: MONGODB_URI environment variable is not set.");
  process.exit(1);
}

// Connect to MongoDB
mongoose
  .connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1); // Exit if the connection fails
  });

// Define a schema for file changes
const fileChangeSchema = new mongoose.Schema({
  filePath: {
    type: String,
    required: true,
  },
  changeType: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const FileChange = mongoose.model("FileChange", fileChangeSchema);

// Create Express app and enable CORS
const app = express();
app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  })
);

// HTTP endpoint to fetch all file changes
app.get("/file-changes", (req, res) => {
  FileChange.find({})
    .sort({ timestamp: -1 })
    .then((fileChanges) => {
      res.json(fileChanges);
    })
    .catch((err) => {
      console.error("Error fetching file changes:", err);
      res.status(500).json({ error: "Internal server error" });
    });
});

const server = http.createServer(app);

// Set up socket.io for WebSocket communication
const io = socketIO(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

// Function to handle file changes and send WebSocket notifications
const handleFileChange = (filePath, changeType) => {
  const fileChange = new FileChange({
    filePath,
    changeType,
  });

  fileChange.save((err) => {
    if (err) {
      console.error("Error saving to database:", err);
    } else {
      console.log(`File ${changeType}: ${filePath}`);

      // Send WebSocket notification
      io.emit("fileChange", {
        filePath,
        changeType,
        timestamp: new Date(),
      });
    }
  });
};
io.on("connection", (socket) => {
  console.log("Client connected");
  socket.on("disconnect", () => console.log("Client disconnected"));
});

// Set up chokidar to monitor a directory
const directoryToMonitor = "c/monitor";

const watcher = chokidar.watch(directoryToMonitor, {
  ignored: /(^|[\/\\])\../,
  persistent: true,
});

// Add chokidar event handlers
watcher
  .on("add", (filePath) => handleFileChange(filePath, "created"))
  .on("change", (filePath) => handleFileChange(filePath, "modified"))
  .on("unlink", (filePath) => handleFileChange(filePath, "deleted"))
  .on("error", (error) => console.error("Watcher error:", error));

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
