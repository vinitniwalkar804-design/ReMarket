import { start } from "../navigation.js";
import renderPage from "../boot.js";
import AdminCustomerDetail from "../pages/admin/customer-detail.js";

start();
renderPage(AdminCustomerDetail, {"guard":"admin","shell":"admin"});
