import { start } from "./navigation.js";
import renderPage from "./boot.js";
import Cart from "./pages/cart.js";

start();
renderPage(Cart, {"guard":"customer","shell":"customer"});
