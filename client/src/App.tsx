/*
 * Lore — App Router
 * Design: Dark Technical Dashboard (IDE-inspired)
 * Dark theme by default, persistent sidebar layout.
 */

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "./contexts/ThemeContext";
import ErrorBoundary from "./components/ErrorBoundary";
import Dashboard from "./pages/Dashboard";

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster
            theme="dark"
            toastOptions={{
              style: {
                background: "oklch(0.155 0.009 264)",
                border: "1px solid oklch(0.28 0.010 264)",
                color: "oklch(0.88 0.006 264)",
              },
            }}
          />
          <Dashboard />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
