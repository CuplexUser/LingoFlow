import { AppProvider } from "./AppProvider";
import { AppShell } from "./components/AppShell";

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
