const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const chokidar = require("chokidar");
const cors = require("cors");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
// const jsonwebtoken = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const registerDetails = require("./registermodel");
const middleware = require("./middleware");
const WebSocket = require("ws");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
dotenv.config();
app.use(express.json());
app.use(cors({ origin: "*" }));
app.use(bodyParser.json());
let currentWatcher = null;
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
const startFileMonitor = (config, res) => {
  const { path, files_to_track, email } = config;

  if (!fs.existsSync(path)) {
    console.error(`Error: The path "${path}" does not exist.`);
    res.status(400).send("selected path doesn't exist"); // Return error message to frontend
    return;
  }
  if (currentWatcher) {
    currentWatcher.close(); // Close existing watcher before starting a new one
  }
  currentWatcher = chokidar.watch(path, { persistent: true, recursive: true });

  currentWatcher.on("all", (eventType, filePath) => {
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
    const { email } = req.body;
    const config = await Config.findOne({ email });

    if (!config) {
      return res.status(404).send("Configuration not found"); // Early return
    }

    if (!fs.existsSync(config.path)) {
      // If path doesn't exist, return early with an error
      return res
        .status(400)
        .send({ error: `Path "${config.path}" does not exist.` });
    }

    startFileMonitor(config); // Start monitoring with valid config
    return res.status(200).send("Monitoring started"); // Send response once
  } catch (error) {
    console.error("Error starting monitoring:", error);
    return res.status(500).send({ error: "Internal Server Error" }); // Return early on error
  }
});

// Endpoint to save configuration
// Endpoint to save configuration
app.post("/config", async (req, res) => {
  try {
    const { name, email, path, interval, files_to_track } = req.body;

    if (!name || !email || !path || !files_to_track) {
      return res.status(400).send("All required fields must be filled.");
    }

    // Update or insert new configuration
    const existingConfig = await Config.findOneAndUpdate(
      { email }, // Assuming email is unique for the configuration
      {
        name,
        path,
        interval,
        files_to_track,
      },
      { new: true, upsert: true } // Insert if it doesn't exist
    );

    if (existingConfig) {
      res.status(201).send("Configuration updated");
    } else {
      const newConfig = new Config({
        name,
        email,
        path,
        interval,
        files_to_track,
      });

      await newConfig.save();
      res.status(201).send("Configuration saved");
    }
  } catch (error) {
    console.error("Error saving configuration:", error);
    res.status(500).send("Internal Server Error");
  }
});
app.post("/stop", (req, res) => {
  try {
    if (currentWatcher) {
      currentWatcher.close(); // Stop current watcher
      currentWatcher = null; // Clear the reference
      return res.status(200).send("Monitoring stopped");
    } else {
      return res.status(400).send("No monitoring in progress");
    }
  } catch (error) {
    console.error("Error stopping monitoring:", error);
    return res.status(500).send("Internal Server Error");
  }
});
app.get("/", (req, res) => {
  return res.send("Hello World");
});

app.post("/register", async (req, res) => {
  try {
    const {
      fullname,
      email,
      mobile,
      password,
      confirmpassword,
      usertype,
      secretkey,
    } = req.body;

    if (
      !fullname ||
      !email ||
      !mobile ||
      !password ||
      !confirmpassword ||
      !usertype
    ) {
      return res.status(400).send("All fields are required");
    }

    const existingUser = await registerDetails.findOne({ email });
    if (existingUser) {
      return res.status(400).send("User already exists");
    }

    if (usertype === "admin") {
      if (secretkey !== process.env.SECRETKEY) {
        return res
          .status(400)
          .send("Invalid secret key for admin registration");
      }

      // Admin registration logic
      const hashedPassword = await bcrypt.hash(password, 10);

      const newAdmin = new registerDetails({
        usertype,
        secretkey,
        fullname,
        email,
        mobile,
        password: hashedPassword,
        confirmpassword: hashedPassword,

        // Add any other admin-specific fields here
      });

      await newAdmin.save();
    } else if (usertype === "user") {
      // User registration logic
      if (password !== confirmpassword) {
        return res.status(400).send("Passwords do not match");
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = new registerDetails({
        usertype,
        fullname,
        email,
        mobile,
        password: hashedPassword,
        confirmpassword: hashedPassword,
      });

      await newUser.save();
    } else {
      return res.status(400).send("Invalid usertype");
    }

    return res.status(200).send("User registered successfully");
  } catch (error) {
    console.error("Server error:", error.message);
    return res.status(500).send("Server error: " + error.message);
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await registerDetails.findOne({ email });

    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const payload = {
      user: {
        id: user.id,
        usertype: user.usertype,
      },
    };

    const secret = process.env.JWT_SECRET || "defaultSecret";
    const expiresIn = 36000000;

    jwt.sign(payload, secret, { expiresIn }, (err, token) => {
      if (err) {
        console.error("Error generating token:", err);
        return res.status(500).json({ error: "Server error" });
      }

      // Include usertype in the response
      return res.json({ token, usertype: user.usertype });
    });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/allprofiles", middleware, async (req, res) => {
  try {
    const data = await registerDetails.find();
    return res.status(200).json({ data });
  } catch (error) {
    console.log("error is", error);
  }
});

app.get("/myprofile", middleware, async (req, res) => {
  try {
    const mydata = await registerDetails.findById(req.user.id);
    return res.status(200).json({ mydata });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Server error" });
  }
});

// Start the HTTP server with WebSocket support
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
