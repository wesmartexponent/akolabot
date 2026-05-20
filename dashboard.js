const express = require("express");
const bcrypt = require("bcryptjs");
const { UserSession, Conversation } = require("./models");

const router = express.Router();

// Middleware to protect routes
function ensureAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect("/login");
}

// Root → redirect to login
router.get("/", (req, res) => {
  res.redirect("/login");
});

// ✅ LOGIN PAGE (SAFE VERSION)
router.get("/login", (req, res) => {
  try {
    res.render("login", { error: null });
  } catch (err) {
    console.error("❌ Login view error:", err);
    res.send("Login Page Working ✅ (view missing)");
  }
});

// POST Login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (username !== process.env.DASHBOARD_USER) {
    return res.render("login", { error: "Invalid credentials" });
  }

  const hash = process.env.DASHBOARD_PASS_HASH || "";
  const ok = await bcrypt.compare(password, hash);

  if (!ok) {
    return res.render("login", { error: "Invalid credentials" });
  }

  req.session.user = { name: username };
  res.redirect("/dashboard");
});

// Logout
router.get("/logout", (req, res) =>
  req.session.destroy(() => res.redirect("/login"))
);

// Dashboard
router.get("/dashboard", ensureAuth, async (req, res) => {
  try {
    const range = req.query.range || "7";
    let startDate = null;

    if (range !== "all") {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);

      if (range === "1") startDate.setDate(startDate.getDate() - 1);
      else if (range === "30") startDate.setDate(startDate.getDate() - 30);
      else startDate.setDate(startDate.getDate() - 7);
    }

    const dateQuery = startDate ? { timestamp: { $gte: startDate } } : {};

    const activePhoneNumbers = await Conversation.distinct("phoneNumber", {
      ...dateQuery,
      messageType: "user",
    });

    const activeUsers = await UserSession.find({
      phoneNumber: { $in: activePhoneNumbers },
    }).sort({ lastInteraction: -1 });

    const totalActiveUsers = activeUsers.length;

    const userMessages = await Conversation.countDocuments({
      ...dateQuery,
      messageType: "user",
    });

    const botMessages = await Conversation.countDocuments({
      ...dateQuery,
      messageType: "bot",
    });

    const englishUsers = await UserSession.countDocuments({ language: "en" });
    const marathiUsers = await UserSession.countDocuments({ language: "mr" });

    res.render("dashboard", {
      totalActiveUsers,
      userMessages,
      botMessages,
      englishUsers,
      marathiUsers,
      activeUsers,
      currentRange: range,
      user: req.session.user,
    });

  } catch (err) {
    console.error("❌ Dashboard error:", err);
    res.status(500).send("Dashboard Error ❌");
  }
});

// ================= CSV EXPORT =================

function escapeCSV(field) {
  if (field == null) return "";
  const str = String(field);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Export Conversations
router.get("/export/conversations", ensureAuth, async (req, res) => {
  try {
    const conversations = await Conversation.find({})
      .sort({ timestamp: -1 })
      .lean();

    const header = "Phone,Name,Message,Type,Time,Lang\n";

    const rows = conversations.map((c) =>
      [
        escapeCSV(c.phoneNumber),
        escapeCSV(c.userName),
        escapeCSV(c.message),
        escapeCSV(c.messageType),
        escapeCSV(new Date(c.timestamp).toLocaleString("en-IN")),
        escapeCSV(c.language),
      ].join(",")
    );

    const csv = header + rows.join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=conversations.csv");
    res.send(csv);

  } catch (err) {
    console.error("❌ CSV error:", err);
    res.status(500).send("CSV Error");
  }
});

module.exports = router;