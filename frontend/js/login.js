import { start } from "./navigation.js";
import renderPage from "./boot.js";
import Login from "./pages/login.js";

start();
renderPage(Login, {"guard":"publicOnly"});
