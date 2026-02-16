import { useCallback, useState, useRef } from "react";
import { Upload, FileText, Image, Loader2 } from "lucide-react";

interface FileDropZoneProps {
  onFileSelected: (file: File) => void;
  isProcessing: boolean;
}

const FileDropZone = ({ onFileSelected, isProcessing }: FileDropZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileSelected(file);
      if (inputRef.current) inputRef.current.value = "";
    },
    [onFileSelected]
  );

  const acceptedTypes = ".pdf,.png,.jpg,.jpeg,.webp";

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative flex flex-col items-center justify-center gap-4
        rounded-lg border-2 border-dashed p-10 transition-all duration-300 cursor-pointer
        ${isDragging
          ? "border-primary bg-primary/10 drop-zone-active"
          : "border-border bg-surface hover:border-primary/50 hover:bg-surface-elevated"
        }
        ${isProcessing ? "pointer-events-none opacity-60" : ""}
      `}
      onClick={() => !isProcessing && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={acceptedTypes}
        onChange={handleFileChange}
        className="hidden"
      />

      {isProcessing ? (
        <>
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
          <p className="text-lg font-medium text-foreground">Processing document…</p>
          <p className="text-sm text-muted-foreground">Extracting meter readings with AI</p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 text-muted-foreground">
            <FileText className="h-8 w-8" />
            <Image className="h-8 w-8" />
          </div>
          <Upload className="h-12 w-12 text-primary" />
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground">
              Drag & Drop PDF or Screenshot Here
            </p>
            <p className="mt-1 text-sm text-muted-foreground">or click to browse files</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Supports PDF, PNG, JPG formats
          </p>
        </>
      )}
    </div>
  );
};

export default FileDropZone;
