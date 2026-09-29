import { start } from "../navigation.js";
import renderPage from "../boot.js";
import AdminModeration from "../pages/admin/moderation.js";

start();
renderPage(AdminModeration, {"guard":"admin","shell":"admin"});
