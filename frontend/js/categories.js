import { start } from "./navigation.js";
import renderPage from "./boot.js";
import Categories from "./pages/categories.js";

start();
renderPage(Categories, {"guard":"customer","shell":"customer"});
