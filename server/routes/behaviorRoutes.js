import { trackEvent, trackEvents, getTimeline, behaviorEventVocabulary } from "../controllers/behaviorController.js";
import { Router } from "express";
import { authenticateUser } from "../middleware/auth.js";

const router = Router();

/**
 * The event vocabulary is public to any signed-in user because the client needs
 * it to know what it is allowed to report. It is a list of strings, not customer
 * data, and returning it is what stops clients from inventing event names that
 * the aggregator would silently ignore.
 */
router.get("/events/vocabulary", authenticateUser, (req, res) => res.json(behaviorEventVocabulary));
router.post("/events", authenticateUser, trackEvent);
router.post("/events/batch", authenticateUser, trackEvents);
router.get("/timeline/:userId?", authenticateUser, getTimeline);

export default router;
