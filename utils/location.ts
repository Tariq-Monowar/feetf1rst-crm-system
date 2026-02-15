import { Request, Response } from "express";

const KEY = process.env.GOOGLE_PLACES_API_KEY;
const COUNTRIES = "country:at|country:de|country:it";
const MIN_LEN = 2;

export const searchLocation = async (req: Request, res: Response) => {
  try {
    const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
    if (!query) return res.status(400).json({ success: false, message: "Query is required", data: [] });
    if (query.length < MIN_LEN) return res.status(400).json({ success: false, message: `Min ${MIN_LEN} characters`, data: [] });

    const resp = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${KEY}&components=${COUNTRIES}&language=en`
    );
    const data = await resp.json();

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      return res.status(400).json({ success: false, message: data.error_message || "Search failed", data: [] });
    }

    const list = (data.predictions || []).map((p: { description?: string }) => (p.description || "").trim());
    return res.status(200).json({ success: true, message: list.length ? "Locations found" : "No locations found", data: list });
  } catch (err) {
    console.error("Search Location Error:", err);
    return res.status(500).json({ success: false, message: "Internal server error", data: [] });
  }
};
