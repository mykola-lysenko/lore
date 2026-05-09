import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHORTCUTS = [
  { key: "j", description: "Select next thread" },
  { key: "k", description: "Select previous thread" },
  { key: "/", description: "Focus search bar" },
  { key: "Enter", description: "Open selected thread / URL in search" },
  { key: "s", description: "Generate AI summary" },
  { key: "c", description: "Toggle Version Compare" },
  { key: "Esc", description: "Clear search / Close thread" },
  { key: "?", description: "Show keyboard shortcuts" },
];

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-sidebar border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground text-sm font-semibold uppercase tracking-wider">Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2 py-2">
          {SHORTCUTS.map((s) => (
            <div key={s.key} className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
              <span className="text-xs text-muted-foreground">{s.description}</span>
              <Kbd className="bg-muted text-[10px] min-w-[20px] h-5">{s.key}</Kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
