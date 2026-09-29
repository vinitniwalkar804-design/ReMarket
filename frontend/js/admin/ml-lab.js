import { start } from "../navigation.js";
import renderPage from "../boot.js";
import AdminMLLab from "../pages/admin/ml-lab.js";

start();
renderPage(AdminMLLab, {"guard":"admin","shell":"admin"});
