import { start } from "./navigation.js";
import renderPage from "./boot.js";
import ProductDetail from "./pages/product-detail.js";

start();
renderPage(ProductDetail, {"guard":"customer","shell":"customer"});
