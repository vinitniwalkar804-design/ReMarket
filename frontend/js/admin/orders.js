import { start } from "../navigation.js";
import renderPage from "../boot.js";
import AdminOrders from "../pages/admin/orders.js";

start();
renderPage(AdminOrders, {"guard":"admin","shell":"admin"});
