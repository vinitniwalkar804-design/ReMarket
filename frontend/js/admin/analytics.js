import { start } from "../navigation.js";
import renderPage from "../boot.js";
import AdminAnalytics from "../pages/admin/analytics.js";

start();
renderPage(AdminAnalytics, {"guard":"admin","shell":"admin"});
