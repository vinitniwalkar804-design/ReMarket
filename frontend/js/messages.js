import { start } from "./navigation.js";
import renderPage from "./boot.js";
import Messages from "./pages/messages.js";

start();
renderPage(Messages, {"guard":"customer","shell":"customer"});
