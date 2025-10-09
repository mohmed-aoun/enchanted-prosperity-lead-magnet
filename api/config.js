export default function handler(req, res) {
  res.status(200).json({
    upsellUrl: process.env.UPSELL_URL || "https://payhip.com/b/Lnsjh/af68defc385c8e9",
    corsOrigin: process.env.CORS_ALLOW_ORIGIN || "*",
    mailerLiteGroupId: process.env.MAILERLITE_GROUP_ID || null,
  });
}

