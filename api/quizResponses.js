import fetch from "node-fetch";

export default async function handler(req, res) {
  // ✅ Handle CORS (important for client form submissions)
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ALLOW_ORIGIN || "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ALLOW_ORIGIN || "*");

  // ✅ Allow POST only
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { leadId, name, email, responses } = req.body || {};

    // ✅ Validate required fields
    if (!leadId || !Array.isArray(responses)) {
      return res
        .status(400)
        .json({ message: "Lead ID and responses array are required." });
    }

    // ✅ Build email summary HTML
    const quizSummary = responses
      .map(
        (entry, i) =>
          `<p><strong>Q${i + 1}:</strong> ${entry.question}<br/><em>${entry.answer}</em></p>`
      )
      .join("");

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; color: #0b1b42;">
        <h2 style="color:#1e3a8a;">Your Credit Insights Are In!</h2>
        <p>Hi ${name?.split(" ")[0] || "there"},</p>
        <p>Thanks for taking the 60-second credit quiz. Here’s a snapshot of what you shared:</p>
        ${quizSummary}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
        <h3 style="color:#b8860b;">Next Step: Unlock the Ultimate Credit Guide</h3>
        <p><a href="${
          process.env.UPSELL_URL ||
          "https://payhip.com/b/Lnsjh/af68defc385c8e9"
        }" style="display:inline-block;padding:12px 20px;background:#b8860b;color:#fff;text-decoration:none;border-radius:6px;">Get The Guide Now →</a></p>
      </div>
    `;

    // ✅ Prepare integration tasks
    const tasks = [];

    // Forward to QUIZ webhook
    if (process.env.QUIZ_WEBHOOK_URL) {
      tasks.push(
        fetch(process.env.QUIZ_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId, name, email, responses }),
        })
      );
    }

    // Forward to Google Sheets webhook (optional)
    if (process.env.GOOGLE_SHEETS_WEBHOOK_URL) {
      const flattened = responses.map(r => `${r.question}: ${r.answer}`).join(" | ");
      tasks.push(
        fetch(process.env.GOOGLE_SHEETS_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "quiz",
            row: [new Date().toISOString(), leadId, name, email, flattened],
          }),
        })
      );
    }

    // Send result email via your email webhook (optional)
    if (process.env.EMAIL_WEBHOOK_URL) {
      tasks.push(
        fetch(process.env.EMAIL_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: email,
            name,
            subject: "Your Credit Quiz Results Are On The Way",
            html: emailHtml,
          }),
        })
      );
    }

    // Add to MailerLite (optional, if you want quiz completers added)
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

    // ✅ Execute tasks concurrently
    await Promise.allSettled(tasks);

    res.status(200).json({ message: "Quiz responses recorded successfully." });
  } catch (error) {
    console.error("Quiz error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}
