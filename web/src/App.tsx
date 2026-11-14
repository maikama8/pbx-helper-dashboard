import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell.js";
import { ThemeProvider } from "./lib/theme.js";
import { Calls } from "./pages/Calls.js";
import { Cdr } from "./pages/Cdr.js";
import { Customers } from "./pages/Customers.js";
import { Extensions } from "./pages/Extensions.js";
import { Login } from "./pages/Login.js";
import { Overview } from "./pages/Overview.js";
import { Tools } from "./pages/Tools.js";
import { Trunks } from "./pages/Trunks.js";

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Shell />}>
            <Route index element={<Overview />} />
            <Route path="calls" element={<Calls />} />
            <Route path="trunks" element={<Trunks />} />
            <Route path="extensions" element={<Extensions />} />
            <Route path="customers" element={<Customers />} />
            <Route path="cdr" element={<Cdr />} />
            <Route path="tools" element={<Tools />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
