import { start } from "./navigation.js";
import renderPage from "./boot.js";
import Compare from "./pages/compare.js";

start();
renderPage(Compare, {"guard":"customer","shell":"customer"});
