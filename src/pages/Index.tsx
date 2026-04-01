import { useState, useCallback, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Download, RotateCcw, Plus, Play, Loader2, Save, LogIn, LayoutDashboard } from "lucide-react";
import bravegenLogo from "@/assets/bravegen-logo.svg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import FileDropZone from "@/components/FileDropZone";
import DataPreviewTable from "@/components/DataPreviewTable";
import ExportSettingsPanel from "@/components/ExportSettingsPanel";
import DocumentPreview from "@/components/DocumentPreview";
import MeterValidationSheet from "@/components/MeterValidationSheet";
import BravegenComparison from "@/components/BravegenComparison";
import { MeterReading, ExportSettings, ValidationExportData, ComparisonExportRow, BravegenRawRow } from "@/types/meter";
import { generateValidationExcel } from "@/lib/excelGenerator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const Index = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const validationId = searchParams.get("validation");

  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationName, setValidationName] = useState("Untitled Validation");
  const [currentValidationId, setCurrentValidationId] = useState<string | null>(validationId);
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

  // Load existing validation from DB
  useEffect(() => {
    if (!validationId || !user) return;
    const load = async () => {
      const { data, error } = await supabase
        .from("validations")
        .select("*")
        .eq("id", validationId)
        .single();
      if (error || !data) {
        toast.error("Could not load validation");
        return;
      }
      setCurrentValidationId(data.id);
      setValidationName(data.name);
      setReadings((data.readings as unknown as MeterReading[]) || []);
      setSettings((data.settings as unknown as ExportSettings) || { siteName: "", buildingName: "", feedName: "", serialNumber: "" });
      setValidationData((data.validation_data as unknown as ValidationExportData) || null);
      setComparisonData((data.comparison_data as unknown as ComparisonExportRow[]) || []);
      setBravegenRawData((data.bravegen_raw_data as unknown as BravegenRawRow[]) || []);
      setSourceImageBase64(data.source_image_base64);
      setSourceImageMime(data.source_image_mime);
    };
    load();
  }, [validationId, user]);

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

  const handleSave = useCallback(async () => {
    if (!user) {
      toast.error("Sign in to save validations");
      navigate("/auth");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        user_id: user.id,
        name: validationName,
        status: readings.length > 0 ? "draft" : "draft",
        readings: readings as any,
        settings: settings as any,
        validation_data: validationData as any,
        comparison_data: comparisonData as any,
        bravegen_raw_data: bravegenRawData as any,
        source_image_base64: sourceImageBase64,
        source_image_mime: sourceImageMime,
      };

      if (currentValidationId) {
        const { error } = await supabase
          .from("validations")
          .update(payload)
          .eq("id", currentValidationId);
        if (error) throw error;
        toast.success("Validation saved!");
      } else {
        const { data, error } = await supabase
          .from("validations")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        setCurrentValidationId(data.id);
        toast.success("Validation saved!");
      }
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error("Failed to save validation");
    } finally {
      setIsSaving(false);
    }
  }, [user, validationName, readings, settings, validationData, comparisonData, bravegenRawData, sourceImageBase64, sourceImageMime, currentValidationId, navigate]);

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

      // Update status if saved
      if (currentValidationId && user) {
        await supabase.from("validations").update({ status: "exported" }).eq("id", currentValidationId);
      }
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Failed to generate Excel file.");
    }
  }, [readings, settings, validationData, comparisonData, bravegenRawData, sourceImageBase64, sourceImageMime, currentValidationId, user]);

  const clearPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewFile(null);
    setPreviewUrl(null);
  };

  const handleClear = () => {
    setReadings([]);
    clearPreview();
    setCurrentValidationId(null);
    setValidationName("Untitled Validation");
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
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
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
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")} className="gap-1.5">
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  Dashboard
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => navigate("/auth")} className="gap-1.5">
                <LogIn className="h-3.5 w-3.5" />
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {/* Validation Name (when signed in) */}
        {user && (
          <div className="flex items-center gap-3">
            <Input
              value={validationName}
              onChange={(e) => setValidationName(e.target.value)}
              className="text-lg font-semibold max-w-md bg-card border-border"
              placeholder="Validation name..."
            />
            {currentValidationId && (
              <span className="text-xs text-muted-foreground">Saved</span>
            )}
          </div>
        )}

        {/* Drop Zone & Extract Button */}
        <div className="space-y-3">
          <FileDropZone
            onFilesSelected={handleFilesSelected}
            isProcessing={isProcessing}
            queuedFiles={queuedFiles}
            onRemoveFile={handleRemoveFile}
            onClearFiles={handleClearQueue}
          />
          {queuedFiles.length > 0 && (
            <Button
              onClick={handleExtractAll}
              disabled={isProcessing}
              className="gap-2 w-full sm:w-auto"
              size="lg"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Extracting…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Extract All ({queuedFiles.length} file{queuedFiles.length !== 1 ? "s" : ""})
                </>
              )}
            </Button>
          )}
        </div>

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
        <div className="flex items-center gap-3 pt-2 flex-wrap">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            variant="default"
            className="gap-2"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {user ? "Save to Account" : "Sign In to Save"}
          </Button>
          <Button
            onClick={handleExport}
            disabled={readings.length === 0}
            variant="outline"
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
