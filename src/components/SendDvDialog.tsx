import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface SendDvDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  validationName: string;
  validationId: string | null;
  onSent?: () => void;
  generateExcel: () => Promise<Blob>;
}

export const SendDvDialog = ({
  open, onOpenChange, validationName, validationId, onSent, generateExcel,
}: SendDvDialogProps) => {
  const [recipientEmail, setRecipientEmail] = useState("support@bravegen.com");
  const [additionalEmail, setAdditionalEmail] = useState("");
  const [message, setMessage] = useState(`Please find attached the Data Validation report for ${validationName}.`);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!recipientEmail) {
      toast.error("Please enter a recipient email");
      return;
    }

    setSending(true);
    try {
      // Generate Excel
      const blob = await generateExcel();
      
      // Convert to base64
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64 = btoa(binary);

      const recipients = [recipientEmail];
      if (additionalEmail) {
        additionalEmail.split(",").map(e => e.trim()).filter(Boolean).forEach(e => recipients.push(e));
      }

      const fileName = `DV_${validationName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;

      const { error } = await supabase.functions.invoke("send-dv-email", {
        body: {
          recipients,
          subject: `Data Validation Report: ${validationName}`,
          message,
          fileName,
          fileBase64: base64,
        },
      });

      if (error) throw error;

      // Update status to submitted
      if (validationId) {
        await supabase.from("validations").update({ status: "submitted" }).eq("id", validationId);
      }

      toast.success("DV sent successfully!");
      onSent?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Send error:", err);
      toast.error("Failed to send DV: " + (err.message || "Unknown error"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Send Data Validation
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Validation</Label>
            <p className="text-sm font-medium text-foreground">{validationName}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Send To *</Label>
            <Input
              value={recipientEmail}
              onChange={e => setRecipientEmail(e.target.value)}
              placeholder="support@bravegen.com"
              className="mt-1"
              type="email"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">CC (comma-separated, optional)</Label>
            <Input
              value={additionalEmail}
              onChange={e => setAdditionalEmail(e.target.value)}
              placeholder="manager@company.com, tech@company.com"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Message</Label>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="mt-1 min-h-[80px]"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={sending} className="gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? "Sending..." : "Send DV"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
