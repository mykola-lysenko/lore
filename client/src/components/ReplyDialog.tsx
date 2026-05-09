import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { type Thread, type EmailMessage } from "@/lib/api";
import { formatFullDate } from "@/lib/utils";

interface ReplyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  thread: Thread;
  targetEmail: EmailMessage;
}

export function ReplyDialog({ open, onOpenChange, thread, targetEmail }: ReplyDialogProps) {
  const [copied, setCopied] = useState(false);
  const [replyText, setReplyText] = useState("");

  useEffect(() => {
    if (open && thread.comments && thread.comments[targetEmail.id]) {
      const emailComments = [...thread.comments[targetEmail.id]].sort((a, b) => a.line_index - b.line_index);
      
      let text = `On ${formatFullDate(targetEmail.date)}, ${targetEmail.from_name} wrote:
`;
      
      for (const c of emailComments) {
        text += `> ${c.quoted_text}

${c.comment}

`;
      }
      
      setReplyText(text.trim());
      setCopied(false);
    }
  }, [open, thread, targetEmail]);

  const handleCopy = () => {
    navigator.clipboard.writeText(replyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-sidebar border-border flex flex-col max-h-[80vh]">
        <DialogHeader className="shrink-0 flex flex-row items-center justify-between pr-8">
          <DialogTitle className="text-foreground">Draft Reply</DialogTitle>
          <Button size="sm" variant="outline" className="gap-2" onClick={handleCopy}>
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied" : "Copy to Clipboard"}
          </Button>
        </DialogHeader>
        <div className="flex-1 overflow-hidden flex flex-col mt-4 min-h-[300px]">
          <textarea
            className="flex-1 w-full h-full bg-input border border-border rounded-md p-4 text-sm font-mono text-foreground/90 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="No comments made on this email yet."
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
