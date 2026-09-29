import { start } from "../navigation.js";
import renderPage from "../boot.js";
import AdminMarketplace from "../pages/admin/marketplace-health.js";

start();
renderPage(AdminMarketplace, {"guard":"admin","shell":"admin"});
