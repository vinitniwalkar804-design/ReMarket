import { start } from "./navigation.js";
import renderPage from "./boot.js";
import Checkout from "./pages/checkout.js";

start();
renderPage(Checkout, {"guard":"customer","shell":"customer"});
