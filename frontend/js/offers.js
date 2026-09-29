import { start } from "./navigation.js";
import renderPage from "./boot.js";
import Offers from "./pages/offers.js";

start();
renderPage(Offers, {"guard":"customer","shell":"customer"});
