import { start } from "../navigation.js";
import renderPage from "../boot.js";
import AdminListings from "../pages/admin/listings.js";

start();
renderPage(AdminListings, {"guard":"admin","shell":"admin"});
