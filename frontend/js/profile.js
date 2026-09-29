import { start } from "./navigation.js";
import renderPage from "./boot.js";
import Profile from "./pages/profile.js";

start();
renderPage(Profile, {"guard":"customer","shell":"customer"});
