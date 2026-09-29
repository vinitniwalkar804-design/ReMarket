import { start } from "./navigation.js";
import renderPage from "./boot.js";
import Notifications from "./pages/notifications.js";

start();
renderPage(Notifications, {"guard":"customer","shell":"customer"});
