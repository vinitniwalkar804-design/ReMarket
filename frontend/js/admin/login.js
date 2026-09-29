import { start } from "../navigation.js";
import renderPage from "../boot.js";
import AdminLogin from "../pages/admin/login.js";

start();
renderPage(AdminLogin, {"guard":"publicOnly"});
