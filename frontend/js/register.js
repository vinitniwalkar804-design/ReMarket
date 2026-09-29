import { start } from "./navigation.js";
import renderPage from "./boot.js";
import Register from "./pages/register.js";

start();
renderPage(Register, {"guard":"publicOnly"});
