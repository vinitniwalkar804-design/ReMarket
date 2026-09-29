import { start } from "../navigation.js";
import renderPage from "../boot.js";
import AdminClusters from "../pages/admin/clusters.js";

start();
renderPage(AdminClusters, {"guard":"admin","shell":"admin"});
