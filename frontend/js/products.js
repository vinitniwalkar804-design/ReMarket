import { start } from "./navigation.js";
import renderPage from "./boot.js";
import Products from "./pages/products.js";

start();
renderPage(Products, {"guard":"customer","shell":"customer"});
