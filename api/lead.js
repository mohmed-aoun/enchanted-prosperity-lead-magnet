import fetch from "node-fetch";

export default async function handler(req, res) {
  // ✅ Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ALLOW_ORIGIN || "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ALLOW_ORIGIN || "*");

  // ✅ Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { name, email, result } = req.body || {};

    if (!name || !email || !result) {
      return res.status(400).json({ message: "Name, email, and result are required." });
    }

    // ✅ Payload for Google Sheets
    const row = { name, email, result };

    // Send to Google Sheets
    if (process.env.SHEETS_ENDPOINT) {
      try {
        const sheetResponse = await fetch(process.env.SHEETS_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(row),
        });

        if (!sheetResponse.ok) {
          const text = await sheetResponse.text(); // get body text for more info
          console.error("❌ Google Sheets POST failed:", sheetResponse.status, sheetResponse.statusText, text, row);
        } else {
          console.log("✅ Sent to Google Sheets:", row);
        }
      } catch (sheetErr) {
        console.error("❌ Failed to send to Google Sheets (network error):", sheetErr, row);
      }
    }

    // Optional: add subscriber to MailerLite
    if (process.env.MAILERLITE_API_KEY && process.env.MAILERLITE_GROUP_ID) {
      try {
        const response = await fetch("https://connect.mailerlite.com/api/subscribers", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.MAILERLITE_API_KEY}`,
          },
          body: JSON.stringify({
            email,
            name,
            fields: {
              credit_result: result,
            },
            groups: [process.env.MAILERLITE_GROUP_ID],
          }),
        });

        const text = await response.text();

        console.log("✅ Added to MailerLite:", {email, result, response: text});
      } catch (mlErr) {
        console.error("❌ Failed to add to MailerLite:", mlErr);
      }
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Lead error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}
