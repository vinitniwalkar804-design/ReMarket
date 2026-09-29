import { start } from "./navigation.js";
import renderPage from "./boot.js";
import Home from "./pages/home.js";

start();
renderPage(Home, {"guard":"customer","shell":"customer"});
