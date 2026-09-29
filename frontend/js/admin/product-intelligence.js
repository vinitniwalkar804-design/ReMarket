import { start } from "../navigation.js";
import renderPage from "../boot.js";
import AdminProductIntel from "../pages/admin/product-intelligence.js";

start();
renderPage(AdminProductIntel, {"guard":"admin","shell":"admin"});
