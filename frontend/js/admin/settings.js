import { start } from "../navigation.js";
import renderPage from "../boot.js";
import AdminSettings from "../pages/admin/settings.js";

start();
renderPage(AdminSettings, {"guard":"admin","shell":"admin"});
