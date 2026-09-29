import { start } from "../navigation.js";
import renderPage from "../boot.js";
import AdminCustomers from "../pages/admin/customers.js";

start();
renderPage(AdminCustomers, {"guard":"admin","shell":"admin"});
