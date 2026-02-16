import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DocumentPreviewProps {
  file: File | null;
  previewUrl: string | null;
  onClear: () => void;
}

const DocumentPreview = ({ file, previewUrl, onClear }: DocumentPreviewProps) => {
  if (!file || !previewUrl) return null;

  const isPdf = file.type === "application/pdf";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Document Preview
          <span className="ml-2 inline-flex items-center rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary normal-case">
            {file.name}
          </span>
        </h2>
        <Button variant="ghost" size="icon" onClick={onClear} className="h-7 w-7 text-muted-foreground hover:text-destructive">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {isPdf ? (
          <iframe
            src={previewUrl}
            title="PDF Preview"
            className="w-full h-[500px]"
          />
        ) : (
          <ScrollArea className="h-[500px] w-full">
            <div className="flex items-start justify-center p-4">
              <img
                src={previewUrl}
                alt="Uploaded document preview"
                className="max-w-full h-auto"
              />
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};

export default DocumentPreview;
