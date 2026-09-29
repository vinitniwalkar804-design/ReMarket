import { start } from "../navigation.js";
import renderPage from "../boot.js";
import AdminPersonas from "../pages/admin/personas.js";

start();
renderPage(AdminPersonas, {"guard":"admin","shell":"admin"});
