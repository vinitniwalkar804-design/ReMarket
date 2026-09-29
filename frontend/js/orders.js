import { start } from "./navigation.js";
import renderPage from "./boot.js";
import Orders from "./pages/orders.js";

start();
renderPage(Orders, {"guard":"customer","shell":"customer"});
