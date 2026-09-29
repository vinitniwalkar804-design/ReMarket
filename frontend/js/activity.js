import { start } from "./navigation.js";
import renderPage from "./boot.js";
import Activity from "./pages/activity.js";

start();
renderPage(Activity, {"guard":"customer","shell":"customer"});
