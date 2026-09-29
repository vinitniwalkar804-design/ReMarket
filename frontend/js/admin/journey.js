import { start } from "../navigation.js";
import renderPage from "../boot.js";
import AdminJourney from "../pages/admin/journey.js";

start();
renderPage(AdminJourney, {"guard":"admin","shell":"admin"});
