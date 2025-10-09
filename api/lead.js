import fetch from "node-fetch";

export default async function handler(req, res) {
  // ✅ Handle CORS
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
    const { name, email, utm_source, utm_medium, utm_campaign, utm_content } =
      req.body || {};

    if (!name || !email) {
      return res.status(400).json({ message: "Name and email are required." });
    }

    // ✅ Construct lead object
    const lead = {
      id: Date.now(),
      created_at: new Date().toISOString(),
      name,
      email,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
    };

    // ✅ Prepare webhook and MailerLite tasks
    const tasks = [];

    // Forward to LEAD_WEBHOOK_URL
    if (process.env.LEAD_WEBHOOK_URL) {
      tasks.push(
        fetch(process.env.LEAD_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead }),
        })
      );
    }

    // Forward to Google Sheets (if webhook provided)
    if (process.env.GOOGLE_SHEETS_WEBHOOK_URL) {
      tasks.push(
        fetch(process.env.GOOGLE_SHEETS_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "lead",
            lead,
            row: [
              new Date().toISOString(),
              name,
              email,
              utm_source || "",
              utm_medium || "",
              utm_campaign || "",
              utm_content || "",
            ],
          }),
        })
      );
    }

    // ✅ Add to MailerLite group (optional)
    if (process.env.MAILERLITE_API_KEY && process.env.MAILERLITE_GROUP_ID) {
      tasks.push(
        fetch("https://connect.mailerlite.com/api/subscribers", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.MAILERLITE_API_KEY}`,
          },
          body: JSON.stringify({
            email,
            name,
            groups: [process.env.MAILERLITE_GROUP_ID],
          }),
        })
      );
    }

    // ✅ Execute all integrations in parallel
    await Promise.allSettled(tasks);

    res.status(200).json({ leadId: lead.id });
  } catch (error) {
    console.error("Lead error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}
