import { start } from "./navigation.js";
import renderPage from "./boot.js";
import Wishlist from "./pages/wishlist.js";

start();
renderPage(Wishlist, {"guard":"customer","shell":"customer"});
