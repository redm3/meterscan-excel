import { useCallback, useState, useRef } from "react";
import { Upload, FileText, Image, X, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileDropZoneProps {
  onFilesSelected: (files: File[]) => void;
  isProcessing: boolean;
  queuedFiles: File[];
  onRemoveFile: (index: number) => void;
  onClearFiles: () => void;
}

const FileDropZone = ({ onFilesSelected, isProcessing, queuedFiles, onRemoveFile, onClearFiles }: FileDropZoneProps) => {
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
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onFilesSelected(files);
    },
    [onFilesSelected]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) onFilesSelected(files);
      if (inputRef.current) inputRef.current.value = "";
    },
    [onFilesSelected]
  );

  const acceptedTypes = ".pdf,.png,.jpg,.jpeg,.webp";

  return (
    <div className="space-y-3">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative flex flex-col items-center justify-center gap-4
          rounded-lg border-2 border-dashed p-10 transition-all duration-300 cursor-pointer
          ${isDragging
            ? "border-primary bg-primary/10"
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
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="flex items-center gap-3 text-muted-foreground">
          <FileText className="h-8 w-8" />
          <Image className="h-8 w-8" />
        </div>
        <Upload className="h-12 w-12 text-primary" />
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">
            Drag & Drop PDFs or Screenshots Here
          </p>
          <p className="mt-1 text-sm text-muted-foreground">or click to browse files — drop multiple at once</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Supports PDF, PNG, JPG formats
        </p>
      </div>

      {/* Queued file thumbnails */}
      {queuedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              {queuedFiles.length} file{queuedFiles.length !== 1 ? "s" : ""} queued
            </p>
            <Button variant="ghost" size="sm" onClick={onClearFiles} className="text-muted-foreground text-xs">
              Clear all
            </Button>
          </div>
          <div className="flex flex-wrap gap-3">
            {queuedFiles.map((file, idx) => (
              <QueuedFileThumbnail key={`${file.name}-${idx}`} file={file} onRemove={() => onRemoveFile(idx)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const QueuedFileThumbnail = ({ file, onRemove }: { file: File; onRemove: () => void }) => {
  const [thumbUrl] = useState(() =>
    file.type.startsWith("image/") ? URL.createObjectURL(file) : null
  );

  return (
    <div className="relative group rounded-md border border-border bg-card overflow-hidden w-24 h-24 flex items-center justify-center">
      {thumbUrl ? (
        <img src={thumbUrl} alt={file.name} className="w-full h-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-1 p-2">
          <FileText className="h-6 w-6 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground truncate w-full text-center">{file.name}</span>
        </div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="h-3.5 w-3.5 text-destructive" />
      </button>
    </div>
  );
};

export default FileDropZone;
