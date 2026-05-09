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
      
      // Get the full body of the target email as an array of lines
      const bodyLines = targetEmail.body.split("\n");
      
      let text = `On ${formatFullDate(targetEmail.date)}, ${targetEmail.from_name} wrote:\n`;
      
      // Track the last line index we processed to know what context to skip or print
      let lastProcessedIdx = -1;

      for (const c of emailComments) {
        // If there's a gap between the last processed line and this comment's line,
        // we should show some context.
        if (c.line_index > lastProcessedIdx + 1) {
          // If the gap is large, we snip. Otherwise print it all.
          if (c.line_index - lastProcessedIdx > 5) {
             if (lastProcessedIdx !== -1) {
               // Print 1 line of trailing context from previous comment
               text += `> ${bodyLines[lastProcessedIdx + 1] || ""}\n`;
             }
             text += `> ...\n`;
             // Print 1 line of leading context before current comment
             text += `> ${bodyLines[c.line_index - 1] || ""}\n`;
          } else {
             // Gap is small, just print all the lines in between
             for (let i = lastProcessedIdx + 1; i < c.line_index; i++) {
               text += `> ${bodyLines[i] || ""}\n`;
             }
          }
        }
        
        // Print the actual line the comment is on
        text += `> ${bodyLines[c.line_index] || c.quoted_text}\n`;
        
        // Print the comment itself
        text += `\n${c.comment}\n\n`;
        
        lastProcessedIdx = c.line_index;
      }
      
      setReplyText(text.trim() + "\n");
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
