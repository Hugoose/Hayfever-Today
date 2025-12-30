import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(cors());

const API_KEY = process.env.API_KEY;   // from .env
const PORT = process.env.PORT || 3000;

if (!API_KEY) {
  console.warn("⚠️  No API_KEY found in .env – Google Pollen API calls will fail.");
}

/**
 * GET /api/pollen?lat=-31.95&lng=115.86
 */
app.get("/api/pollen", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: "Missing or invalid lat/lng query params" });
    }

    // Build Google Pollen API URL (GET request with query params)
    const url = new URL("https://pollen.googleapis.com/v1/forecast:lookup");
    url.searchParams.set("key", API_KEY);
    url.searchParams.set("languageCode", "en");
    url.searchParams.set("days", "1");
    url.searchParams.set("location.latitude", lat.toString());
    url.searchParams.set("location.longitude", lng.toString());

    const response = await fetch(url.toString());
    const rawText = await response.text();

    console.log("Google Pollen status:", response.status);

    if (!response.ok) {
      // Forward Google’s error back to the client so we can see what’s wrong
      return res.status(response.status).json({
        error: "Pollen API error",
        status: response.status,
        bodyPreview: rawText.slice(0, 300),
      });
    }

    // Try to parse JSON from Google
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({
        error: "Invalid JSON from Pollen API",
        bodyPreview: rawText.slice(0, 300),
      });
    }

    // Pull out today's grass pollen index if available
    const today = data.dailyInfo?.[0];
    const grass = today?.pollenTypeInfo?.find((p) => p.code === "GRASS");
    const indexInfo = grass?.indexInfo || null;

    if (!indexInfo) {
      return res.json({
        lat,
        lng,
        level: "unknown",
        label: "Pollen level unknown",
        colour: "#64748b",
        grassIndex: null,
        raw: data,
      });
    }

    const value = indexInfo.value;        // 0–5
    const category = indexInfo.category;  // "Low", "Moderate", etc.
    const description = indexInfo.indexDescription || "";

    // Map value → your four levels + colours
    let level, colour, label;

    if (value <= 1) {
      level = "low";
      colour = "#22c55e";   // green
      label = "Low pollen";
    } else if (value === 2 || value === 3) {
      level = "moderate";
      colour = "#eab308";   // yellow
      label = "Moderate pollen";
    } else if (value === 4) {
      level = "high";
      colour = "#f97316";   // orange
      label = "High pollen";
    } else {
      level = "extreme";
      colour = "#ef4444";   // red
      label = "Extreme pollen";
    }

    return res.json({
      lat,
      lng,
      level,           // "low" | "moderate" | "high" | "extreme"
      label,           // "Low pollen", etc.
      colour,          // hex colour for your UI
      indexValue: value,
      category,
      description,
      grassIndex: indexInfo,  // full grass index details (optional)
      raw: data,              // full response (optional – handy while building)
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Server error", details: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Hayfever API running at http://localhost:${PORT}`);
});
