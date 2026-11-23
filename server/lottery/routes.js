const express = require("express");

const router = express.Router();

// Read-only public readiness endpoint. No purchase, payment, ticket issuance,
// draw, winner, or payout mutation endpoints are exposed by this module.
router.get("/status", async (req, res) => {
  const db = req.app.locals.db;
  if (!db) {
    return res.set("Cache-Control", "no-store").status(503).json({
      status: "planned",
      salesEnabled: false,
      livePaymentsEnabled: false,
      liveDrawsEnabled: false
    });
  }

  try {
    const result = await db.query(
      "SELECT public_status, sales_enabled, live_payments_enabled, live_draws_enabled FROM raffle_feature_control WHERE id=1"
    );
    const control = result.rows[0];
    if (!control) throw new Error("Raffle feature control is missing");

    // Fail closed: a public response never reports live capability as enabled
    // until a separately reviewed activation release exists.
    return res.set("Cache-Control", "no-store").json({
      status: control.public_status === "active" ? "planned" : control.public_status,
      salesEnabled: false,
      livePaymentsEnabled: false,
      liveDrawsEnabled: false
    });
  } catch {
    return res.set("Cache-Control", "no-store").status(503).json({
      status: "planned",
      salesEnabled: false,
      livePaymentsEnabled: false,
      liveDrawsEnabled: false
    });
  }
});

module.exports = router;
