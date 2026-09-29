import { start } from "../navigation.js";
import renderPage from "../boot.js";
import AdminSellers from "../pages/admin/sellers.js";

start();
renderPage(AdminSellers, {"guard":"admin","shell":"admin"});
