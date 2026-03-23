import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Download, RotateCcw, Plus, Play, Loader2 } from "lucide-react";
import bravegenLogo from "@/assets/bravegen-logo.svg";
import { Button } from "@/components/ui/button";
import FileDropZone from "@/components/FileDropZone";
import DataPreviewTable from "@/components/DataPreviewTable";
import ExportSettingsPanel from "@/components/ExportSettingsPanel";
import DocumentPreview from "@/components/DocumentPreview";
import MeterValidationSheet from "@/components/MeterValidationSheet";
import BravegenComparison from "@/components/BravegenComparison";
import { MeterReading, ExportSettings, ValidationExportData, ComparisonExportRow, BravegenRawRow } from "@/types/meter";
import { generateValidationExcel } from "@/lib/excelGenerator";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [settings, setSettings] = useState<ExportSettings>({
    siteName: "",
    buildingName: "",
    feedName: "",
    serialNumber: "",
  });
  const [validationData, setValidationData] = useState<ValidationExportData | null>(null);
  const [comparisonData, setComparisonData] = useState<ComparisonExportRow[]>([]);
  const [bravegenRawData, setBravegenRawData] = useState<BravegenRawRow[]>([]);
  const [sourceImageBase64, setSourceImageBase64] = useState<string | null>(null);
  const [sourceImageMime, setSourceImageMime] = useState<string | null>(null);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleFilesSelected = useCallback((files: File[]) => {
    const allowedTypes = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
    const valid = files.filter((f) => {
      if (!allowedTypes.includes(f.type)) {
        toast.error(`Unsupported file: ${f.name}`);
        return false;
      }
      if (f.size > 20 * 1024 * 1024) {
        toast.error(`File too large: ${f.name}`);
        return false;
      }
      return true;
    });
    if (valid.length > 0) {
      setQueuedFiles((prev) => [...prev, ...valid]);
      toast.success(`Added ${valid.length} file${valid.length !== 1 ? "s" : ""} to queue`);
    }
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setQueuedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleClearQueue = useCallback(() => {
    setQueuedFiles([]);
  }, []);

  const handleExtractAll = useCallback(async () => {
    if (queuedFiles.length === 0) {
      toast.error("No files queued for extraction.");
      return;
    }

    setIsProcessing(true);
    let totalExtracted = 0;

    for (const file of queuedFiles) {
      try {
        // Set preview to the last processed file
        setPreviewFile(file);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(file));

        const imageBase64 = await fileToBase64(file);

        if (file.type.startsWith("image/")) {
          setSourceImageBase64(imageBase64);
          setSourceImageMime(file.type);
        }

        const { data, error } = await supabase.functions.invoke("extract-meter-data", {
          body: { imageBase64, mimeType: file.type },
        });

        if (error) throw error;

        const extracted: MeterReading[] = (data.readings || []).map(
          (r: any, i: number) => ({
            id: crypto.randomUUID(),
            loadName: r.loadName || `Load ${i + 1}`,
            loadId: r.loadId ?? null,
            ctRating: r.ctRating ?? null,
            dateTime: r.dateTime ?? null,
            physicalMeterRead: r.physicalMeterRead ?? null,
            ph1Amps: r.ph1Amps ?? null,
            ph2Amps: r.ph2Amps ?? null,
            ph3Amps: r.ph3Amps ?? null,
            voltage: r.voltage ?? null,
            pf: r.pf ?? null,
          })
        );

        if (extracted.length > 0) {
          setReadings((prev) => [...prev, ...extracted]);
          totalExtracted += extracted.length;
        } else {
          toast.warning(`No readings found in ${file.name}`);
        }
      } catch (err: any) {
        console.error("OCR error:", err);
        toast.error(`Failed to extract from ${file.name}`);
      }
    }

    setQueuedFiles([]);
    if (totalExtracted > 0) {
      toast.success(`Extracted ${totalExtracted} meter readings from ${queuedFiles.length} file${queuedFiles.length !== 1 ? "s" : ""}`);
    }
    setIsProcessing(false);
  }, [queuedFiles]);
  const handleExport = useCallback(async () => {
    if (readings.length === 0) {
      toast.error("No data to export.");
      return;
    }
    try {
      const blob = await generateValidationExcel(readings, settings, validationData, comparisonData, bravegenRawData, sourceImageBase64, sourceImageMime);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const datePart = new Date().toISOString().slice(0, 10);
      const sitePart = settings.siteName || "Site";
      a.download = `Validation_${sitePart}_${datePart}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel file downloaded!");
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Failed to generate Excel file.");
    }
  }, [readings, settings, validationData, comparisonData, bravegenRawData, sourceImageBase64, sourceImageMime]);

  const clearPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewFile(null);
    setPreviewUrl(null);
  };

  const handleClear = () => {
    setReadings([]);
    clearPreview();
    toast.info("Data cleared.");
  };

  const addEmptyRow = () => {
    setReadings((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        loadName: `Tenant #${String(prev.length + 1).padStart(2, "0")}`,
        loadId: prev.length + 1,
        ctRating: null,
        dateTime: null,
        physicalMeterRead: null,
        ph1Amps: null,
        ph2Amps: null,
        ph3Amps: null,
        voltage: null,
        pf: null,
      },
    ]);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-4">
          <img src={bravegenLogo} alt="BraveGen" className="h-10" />
          <div className="hidden sm:block">
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              Meter Data Validation Tool
            </h1>
            <p className="text-xs text-muted-foreground">
              Extract · Validate · Export
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {/* Drop Zone */}
        <FileDropZone onFileSelected={handleFileSelected} isProcessing={isProcessing} />

        {/* Document Preview */}
        <DocumentPreview file={previewFile} previewUrl={previewUrl} onClear={clearPreview} />

        {/* Export Settings */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Export Settings
          </h2>
          <ExportSettingsPanel settings={settings} onChange={setSettings} />
        </div>

        {/* Data Preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Extracted Data Preview
              {readings.length > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {readings.length} rows
                </span>
              )}
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={addEmptyRow}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Row
            </Button>
          </div>
          <DataPreviewTable data={readings} onDataChange={setReadings} />
        </div>

        {/* Meter Validation Sheet */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Meter Read Validation
          </h2>
          <MeterValidationSheet readings={readings} onDataChange={setValidationData} />
        </div>

        {/* BraveGen Comparison */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            BraveGen Data Comparison
          </h2>
          <BravegenComparison readings={readings} onDataChange={setComparisonData} onRawDataChange={setBravegenRawData} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={handleExport}
            disabled={readings.length === 0}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export to Excel
          </Button>
          <Button
            variant="outline"
            onClick={handleClear}
            disabled={readings.length === 0}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Clear
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Index;
