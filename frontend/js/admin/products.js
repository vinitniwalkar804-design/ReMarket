import { start } from "../navigation.js";
import renderPage from "../boot.js";
import AdminProducts from "../pages/admin/products.js";

start();
renderPage(AdminProducts, {"guard":"admin","shell":"admin"});
