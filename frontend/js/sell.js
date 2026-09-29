import { start } from "./navigation.js";
import renderPage from "./boot.js";
import Sell from "./pages/sell.js";

start();
renderPage(Sell, {"guard":"customer","shell":"customer"});
