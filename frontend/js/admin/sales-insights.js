import { start } from "../navigation.js";
import renderPage from "../boot.js";
import SalesInsights from "../pages/admin/sales-insights.js";

start();
renderPage(SalesInsights, {"guard":"admin","shell":"admin"});
