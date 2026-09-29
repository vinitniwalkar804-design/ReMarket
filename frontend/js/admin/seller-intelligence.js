import { start } from "../navigation.js";
import renderPage from "../boot.js";
import SellerIntelligence from "../pages/admin/seller-intelligence.js";

start();
renderPage(SellerIntelligence, {"guard":"admin","shell":"admin"});
