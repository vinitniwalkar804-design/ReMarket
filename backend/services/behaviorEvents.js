/**
 * Single entry point for behaviour events the API records itself.
 *
 * Controllers used to call `BehaviorEvent.create({...})` directly, which meant
 * two things had to be repeated at every call site and were easy to forget:
 * the acting user, and the browsing session. The session id is not cosmetic:
 * `sessionFrequency` is one of the modelled clustering features, and an event
 * stored without one forces the feature builder to infer sessions from idle
 * gaps instead of counting the real sessions the client reported.
 *
 * Every write goes through here so those two facts can never drift apart again.
 */
import { BehaviorEvent } from "../models/index.js";
import { sessionIdFromRequest } from "../middleware/auth.js";

/**
 * @param {import('express').Request} req
 * @param {object} payload - eventType plus any productId/category/metadata
 */
export const recordEvent = (req, payload) =>
  BehaviorEvent.create({
    sessionId: sessionIdFromRequest(req),
    ...payload,
  });

export default recordEvent;
