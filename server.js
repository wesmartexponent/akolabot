require('dotenv').config({ override: true });
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const mongoose = require("mongoose");
const path = require("path");

const botRoutes = require("./botRoutes");
const dashboardRoutes = require("./dashboard");

const app = express();

// ✅ DEBUG ROOT (VERY IMPORTANT)
app.get("/", (req, res) => {
  res.redirect("/login");
});

app.get("/test", (req, res) => {
  res.send("TEST ROUTE WORKING ✅");
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Views setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// MongoDB connect
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error("❌ Missing MONGODB_URI in .env");
  process.exit(1);
}

mongoose
  .connect(mongoUri)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// Sessions
app.use(
  session({
    secret: process.env.SESSION_SECRET || "a-very-strong-secret-key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: mongoUri }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 },
  })
);

// Routes
app.use("/", dashboardRoutes);
app.use("/bot", botRoutes);

// ✅ 404 fallback (IMPORTANT)
app.use((req, res) => {
  res.status(404).send("Route Not Found ❌");
});

// Start server
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

console.log("TOKEN:", process.env.WHATSAPP_TOKEN ? "OK" : "MISSING");
console.log("PHONE_ID:", process.env.PHONE_NUMBER_ID ? "OK" : "MISSING");