const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const chokidar = require("chokidar");
const cors = require("cors");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const WebSocket = require("ws");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
dotenv.config();

app.use(cors({ origin: "http://localhost:5173" }));
app.use(bodyParser.json());

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1); // Exit if the connection fails
  });

// Create an HTTP server for WebSocket support
const server = http.createServer(app);

// Set up WebSocket server
const wss = new WebSocket.Server({ server });

// Broadcast function to send messages to WebSocket clients
const broadcast = (message) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
};

// Configuration schema for MongoDB
const ConfigSchema = new mongoose.Schema({
  name: String,
  email: String,
  path: String,
  interval: Number,
  files_to_track: [String],
});

const Config = mongoose.model("Config", ConfigSchema);

// Function to send email notifications using Nodemailer
const sendEmail = (recipient, subject, message) => {
  const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: recipient,
    subject,
    text: message,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email:", error);
    } else {
      console.log("Email sent:", info.response);
    }
  });
};

// Function to monitor files and send alerts
const startFileMonitor = (config) => {
  const { path, files_to_track, email } = config;

  if (!fs.existsSync(path)) {
    console.error(`Error: The path "${path}" does not exist.`);
    return;
  }

  const watcher = chokidar.watch(path, { persistent: true, recursive: true });

  watcher.on("all", (eventType, filePath) => {
    console.log(`File event: ${eventType} on ${filePath}`);

    // Broadcast file events to WebSocket clients
    broadcast({
      eventType,
      filePath,
    });

    // Send email notification for specific file events
    sendEmail(
      email,
      "File Event Notification",
      `File ${eventType} on ${filePath}`
    ); // Send email to the configured recipient
  });

  console.log(`Monitoring ${path} with Chokidar.`);
};

// Endpoint to start monitoring
app.post("/start", async (req, res) => {
  try {
    const config = await Config.findOne();
    if (config) {
      startFileMonitor(config); // Start monitoring and send email notifications
      res.status(200).send("Monitoring started");
    } else {
      res.status(404).send("Configuration not found");
    }
  } catch (error) {
    console.error("Error starting monitoring:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Endpoint to save configuration
app.post("/config", async (req, res) => {
  try {
    const newConfig = new Config(req.body);
    await newConfig.save(); // Save the configuration
    res.status(201).send("Configuration saved");
  } catch (error) {
    console.error("Error saving configuration:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Start the HTTP server with WebSocket support
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
