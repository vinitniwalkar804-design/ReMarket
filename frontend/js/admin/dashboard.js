import { start } from "../navigation.js";
import renderPage from "../boot.js";
import AdminDashboard from "../pages/admin/dashboard.js";

start();
renderPage(AdminDashboard, {"guard":"admin","shell":"admin"});
