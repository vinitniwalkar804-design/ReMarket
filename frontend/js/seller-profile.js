import { start } from "./navigation.js";
import renderPage from "./boot.js";
import SellerProfile from "./pages/seller-profile.js";

start();
renderPage(SellerProfile, {"guard":"customer","shell":"customer"});
