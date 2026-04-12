import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Droplets, Flame, Camera, X, Upload, FileSpreadsheet, ChevronDown, ChevronUp, Copy, Gauge, LogIn, LayoutDashboard, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import bravegenLogo from "@/assets/bravegen-logo.svg";
import * as XLSX from "xlsx";

type MeterMode = "water" | "gas";

interface SiteInfo {
  feed: string;
  serialNumber: string;
  site: string;
  building: string;
}

interface MeterRead {
  image: string | null;
  imageFile: File | null;
  imageBase64: string | null;
  imageMime: string | null;
  dateTime: string;
  reading: string;
}

interface HubRow {
  load: string;
  dateFirst: string;
  dateSecond: string;
  firstRead: number | null;
  secondRead: number | null;
  difference: number | null;
  hubCount: number | null;
  factor: number | null;
  hubVolume: number | null;
  accuracy: number | null;
  result: string;
}

interface ParsedPulseData {
  channelName: string;
  pulseCount1: number;
  pulseCount2: number;
  dateTime1: string;
  dateTime2: string;
  pulseDiff: number;
}

const DEFAULT_FACTORS: Record<MeterMode, number> = { water: 0.005, gas: 0.3 };

const PulseMeter = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<MeterMode>("water");
  const [siteInfoOpen, setSiteInfoOpen] = useState(true);
  const [siteInfo, setSiteInfo] = useState<SiteInfo>({ feed: "", serialNumber: "", site: "", building: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [currentValidationId, setCurrentValidationId] = useState<string | null>(null);

  const [firstRead, setFirstRead] = useState<MeterRead>({ image: null, imageFile: null, imageBase64: null, imageMime: null, dateTime: "", reading: "" });
  const [secondRead, setSecondRead] = useState<MeterRead>({ image: null, imageFile: null, imageBase64: null, imageMime: null, dateTime: "", reading: "" });
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [extractingFirst, setExtractingFirst] = useState(false);
  const [extractingSecond, setExtractingSecond] = useState(false);

  const [hubFile, setHubFile] = useState<string | null>(null);
  const [hubRows, setHubRows] = useState<HubRow[]>([]);
  const [selectedHubRow, setSelectedHubRow] = useState<number>(0);
  const [manualHubCount, setManualHubCount] = useState("");
  const [manualPulseCount1, setManualPulseCount1] = useState("");
  const [manualPulseCount2, setManualPulseCount2] = useState("");
  const [pulseDateTime1, setPulseDateTime1] = useState("");
  const [pulseDateTime2, setPulseDateTime2] = useState("");
  const [manualFactor, setManualFactor] = useState(String(DEFAULT_FACTORS["water"]));

  const [overrideFirstRead, setOverrideFirstRead] = useState("");
  const [overrideSecondRead, setOverrideSecondRead] = useState("");
  const [overrideHubCount, setOverrideHubCount] = useState("");
  const [overrideFactor, setOverrideFactor] = useState("");

  const [comments, setComments] = useState("");
  const [validationName, setValidationName] = useState("Untitled Pulse Validation");

  const firstInputRef = useRef<HTMLInputElement>(null);
  const secondInputRef = useRef<HTMLInputElement>(null);
  const hubInputRef = useRef<HTMLInputElement>(null);

  const unit = mode === "water" ? "m³" : "NcM";

  // Load saved validation from URL params
  useEffect(() => {
    const validationId = searchParams.get("validation");
    if (!validationId) return;

    const loadValidation = async () => {
      const { data, error } = await supabase
        .from("validations")
        .select("*")
        .eq("id", validationId)
        .single();

      if (error || !data) {
        toast.error("Failed to load validation");
        return;
      }

      setCurrentValidationId(data.id);
      setValidationName(data.name || "Untitled Pulse Validation");

      const settings = data.settings as any;
      if (settings) {
        setSiteInfo({
          feed: settings.feed || "",
          serialNumber: settings.serialNumber || "",
          site: settings.site || "",
          building: settings.building || "",
        });
        if (settings.meterMode === "gas" || settings.meterMode === "water") {
          setMode(settings.meterMode);
        }
      }

      const vd = data.validation_data as any;
      if (vd) {
        // Restore first read
        if (vd.firstRead) {
          const fr = vd.firstRead;
          setFirstRead({
            image: fr.imageBase64 ? `data:${fr.imageMime || "image/jpeg"};base64,${fr.imageBase64}` : null,
            imageFile: null,
            imageBase64: fr.imageBase64 || null,
            imageMime: fr.imageMime || null,
            dateTime: fr.dateTime || "",
            reading: fr.reading || "",
          });
        }
        // Restore second read
        if (vd.secondRead) {
          const sr = vd.secondRead;
          setSecondRead({
            image: sr.imageBase64 ? `data:${sr.imageMime || "image/jpeg"};base64,${sr.imageBase64}` : null,
            imageFile: null,
            imageBase64: sr.imageBase64 || null,
            imageMime: sr.imageMime || null,
            dateTime: sr.dateTime || "",
            reading: sr.reading || "",
          });
        }
        // Restore hub data
        if (vd.hubRows) setHubRows(vd.hubRows);
        if (vd.selectedHubRow != null) setSelectedHubRow(vd.selectedHubRow);
        if (vd.manualHubCount) setManualHubCount(vd.manualHubCount);
        if (vd.manualPulseCount1) setManualPulseCount1(vd.manualPulseCount1);
        if (vd.manualPulseCount2) setManualPulseCount2(vd.manualPulseCount2);
        if (vd.manualFactor) setManualFactor(vd.manualFactor);
        if (vd.overrideFirstRead) setOverrideFirstRead(vd.overrideFirstRead);
        if (vd.overrideSecondRead) setOverrideSecondRead(vd.overrideSecondRead);
        if (vd.overrideHubCount) setOverrideHubCount(vd.overrideHubCount);
        if (vd.overrideFactor) setOverrideFactor(vd.overrideFactor);
        if (vd.comments) setComments(vd.comments);
      }
    };

    loadValidation();
  }, [searchParams]);

  const r1 = parseFloat(overrideFirstRead || firstRead.reading) || 0;
  const r2 = parseFloat(overrideSecondRead || secondRead.reading) || 0;
  const physicalDiff = r2 - r1;

  const activeHubRow = hubRows[selectedHubRow] || null;
  const pc1 = parseFloat(manualPulseCount1) || 0;
  const pc2 = parseFloat(manualPulseCount2) || 0;
  const calculatedPulseDiff = pc1 > 0 || pc2 > 0 ? pc2 - pc1 : 0;
  const effectiveManualHubCount = manualHubCount || (calculatedPulseDiff !== 0 ? String(calculatedPulseDiff) : "");
  const hubCount = parseFloat(overrideHubCount || (activeHubRow ? String(activeHubRow.hubCount ?? "") : effectiveManualHubCount)) || 0;
  const factor = parseFloat(overrideFactor || (activeHubRow ? String(activeHubRow.factor ?? "") : manualFactor)) || 0;
  const hubVolume = hubCount * factor;
  const accuracy = physicalDiff !== 0 ? (hubVolume / physicalDiff) * 100 : 0;

  const getStatus = (acc: number) => {
    if (acc === 0) return { label: "N/A", color: "bg-muted text-muted-foreground" };
    if (acc >= 95 && acc <= 105) return { label: "PASS", color: "bg-primary text-primary-foreground" };
    if ((acc >= 90 && acc < 95) || (acc > 105 && acc <= 110)) return { label: "MARGINAL", color: "bg-yellow-500 text-black" };
    return { label: "FAIL", color: "bg-destructive text-destructive-foreground" };
  };
  const status = getStatus(accuracy);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
      reader.readAsDataURL(file);
    });

  // AI extraction of meter reading from photo
  const extractMeterReading = async (base64: string, mime: string, which: "first" | "second") => {
    const setExtracting = which === "first" ? setExtractingFirst : setExtractingSecond;
    const setter = which === "first" ? setFirstRead : setSecondRead;
    setExtracting(true);

    try {
      const { data, error } = await supabase.functions.invoke("extract-pulse-meter", {
        body: { imageBase64: base64, mimeType: mime },
      });

      if (error) {
        console.error("Extraction error:", error);
        toast.error("Could not extract reading from image. Please enter manually.");
        return;
      }

      if (data?.reading != null) {
        setter(prev => ({ ...prev, reading: String(data.reading) }));
        toast.success(`Reading extracted: ${data.reading}${data.confidence === "low" ? " (low confidence — please verify)" : ""}`);
      }
      if (data?.dateTime) {
        // Convert ISO to datetime-local format
        const dt = new Date(data.dateTime);
        if (!isNaN(dt.getTime())) {
          const local = dt.toISOString().slice(0, 16);
          setter(prev => ({ ...prev, dateTime: local }));
        }
      }
      if (data?.notes) {
        console.log(`AI notes (${which}):`, data.notes);
      }
    } catch (err) {
      console.error("Extraction failed:", err);
      toast.error("Failed to extract reading. Please enter manually.");
    } finally {
      setExtracting(false);
    }
  };

  const handleImageDrop = useCallback((which: "first" | "second") => async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const base64 = await fileToBase64(file);
    const setter = which === "first" ? setFirstRead : setSecondRead;
    setter(prev => ({ ...prev, image: url, imageFile: file, imageBase64: base64, imageMime: file.type }));
    // Trigger AI extraction
    extractMeterReading(base64, file.type, which);
  }, []);

  const handleImageSelect = useCallback((which: "first" | "second") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const base64 = await fileToBase64(file);
    const setter = which === "first" ? setFirstRead : setSecondRead;
    setter(prev => ({ ...prev, image: url, imageFile: file, imageBase64: base64, imageMime: file.type }));
    // Trigger AI extraction
    extractMeterReading(base64, file.type, which);
  }, []);

  const removeImage = (which: "first" | "second") => {
    const setter = which === "first" ? setFirstRead : setSecondRead;
    setter(prev => ({ ...prev, image: null, imageFile: null, imageBase64: null, imageMime: null }));
  };

  const handleHubFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setHubFile(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", raw: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

        // Try to detect ESP Analytics CSV format (Event, Load/Channel Name, ..., Usage)
        const firstRow = (json[0] || []).map((c: any) => String(c).toLowerCase().trim());
        const isEspFormat = firstRow.some(h => h.includes("event")) && firstRow.some(h => h.includes("usage"));

        if (isEspFormat) {
          const eventCol = firstRow.findIndex(h => h.includes("event"));
          const loadCol = firstRow.findIndex(h => h.includes("load") || h.includes("channel name"));
          const usageCol = firstRow.findIndex(h => h.includes("usage"));

          if (eventCol < 0 || usageCol < 0) {
            toast.error("Could not find Event/Usage columns.");
            return;
          }

          // Group by channel name
          const channels: Record<string, { events: string[]; usages: number[] }> = {};
          for (let i = 1; i < json.length; i++) {
            const row = json[i];
            if (!row || row.length === 0) continue;
            const channelName = loadCol >= 0 ? String(row[loadCol] || "").trim() : "Default";
            const eventStr = String(row[eventCol] || "").trim();
            const usage = parseFloat(String(row[usageCol])) || 0;
            if (!eventStr) continue;
            if (!channels[channelName]) channels[channelName] = { events: [], usages: [] };
            channels[channelName].events.push(eventStr);
            channels[channelName].usages.push(usage);
          }

          const channelNames = Object.keys(channels);
          if (channelNames.length === 0) {
            toast.error("No data rows found.");
            return;
          }

          // Use first channel — take first and last usage as pulse count 1 & 2
          const ch = channels[channelNames[0]];
          const pc1 = ch.usages[0];
          const pc2 = ch.usages[ch.usages.length - 1];
          const dt1Raw = ch.events[0];
          const dt2Raw = ch.events[ch.events.length - 1];

          // Parse DD/MM/YYYY HH:mm:ss → datetime-local format
          const parseEspDate = (s: string): string => {
            const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
            if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}`;
            return "";
          };

          setManualPulseCount1(String(pc1));
          setManualPulseCount2(String(pc2));
          setPulseDateTime1(parseEspDate(dt1Raw));
          setPulseDateTime2(parseEspDate(dt2Raw));
          setManualHubCount("");
          setHubRows([]);

          toast.success(`Extracted pulse counts from "${channelNames[0]}": ${pc1} → ${pc2} (diff: ${pc2 - pc1})`);
          return;
        }

        // Fallback: original structured format with load/hub count/factor columns
        let headerIdx = -1;
        for (let i = 0; i < Math.min(json.length, 20); i++) {
          const row = (json[i] || []).map((c: any) => String(c).toLowerCase());
          if (row.some((c: string) => c.includes("load")) && row.some((c: string) => c.includes("hub") || c.includes("count") || c.includes("pulse"))) {
            headerIdx = i;
            break;
          }
        }

        if (headerIdx === -1) {
          toast.error("Could not find expected columns. Please enter values manually.");
          return;
        }

        const headers = json[headerIdx].map((c: any) => String(c).toLowerCase().trim());
        const findCol = (keywords: string[]) => headers.findIndex(h => keywords.some(k => h.includes(k)));

        const loadCol = findCol(["load"]);
        const hubCountCol = findCol(["hub count", "pulse count", "count"]);
        const factorCol = findCol(["factor", "pulse factor"]);
        const hubVolCol = findCol(["hub water", "hub volume", "hub gas"]);
        const accCol = findCol(["accuracy"]);
        const resultCol = findCol(["result"]);
        const diffCol = findCol(["difference", "diff"]);
        const firstReadCol = findCol(["first read"]);
        const secondReadCol = findCol(["second read"]);
        const dateFirstCol = findCol(["date", "first date"]);
        const dateSecondCol = findCol(["second date"]);

        const rows: HubRow[] = [];
        for (let i = headerIdx + 1; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length === 0) continue;
          const load = row[loadCol] != null ? String(row[loadCol]).trim() : "";
          if (!load) continue;
          rows.push({
            load,
            dateFirst: dateFirstCol >= 0 && row[dateFirstCol] ? String(row[dateFirstCol]) : "",
            dateSecond: dateSecondCol >= 0 && row[dateSecondCol] ? String(row[dateSecondCol]) : "",
            firstRead: firstReadCol >= 0 ? parseFloat(String(row[firstReadCol])) || null : null,
            secondRead: secondReadCol >= 0 ? parseFloat(String(row[secondReadCol])) || null : null,
            difference: diffCol >= 0 ? parseFloat(String(row[diffCol])) || null : null,
            hubCount: hubCountCol >= 0 ? parseFloat(String(row[hubCountCol])) || null : null,
            factor: factorCol >= 0 ? parseFloat(String(row[factorCol])) || null : null,
            hubVolume: hubVolCol >= 0 ? parseFloat(String(row[hubVolCol])) || null : null,
            accuracy: accCol >= 0 ? parseFloat(String(row[accCol])) || null : null,
            result: resultCol >= 0 && row[resultCol] ? String(row[resultCol]) : "",
          });
        }

        if (rows.length === 0) {
          toast.error("No data rows found in the file.");
          return;
        }
        setHubRows(rows);
        setSelectedHubRow(0);
        toast.success(`Imported ${rows.length} row(s) from ${file.name}`);
      } catch {
        toast.error("Failed to parse the uploaded file.");
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleSave = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    setIsSaving(true);
    try {
      const validationData = JSON.parse(JSON.stringify({
        firstRead: { dateTime: firstRead.dateTime, reading: firstRead.reading, imageBase64: firstRead.imageBase64, imageMime: firstRead.imageMime },
        secondRead: { dateTime: secondRead.dateTime, reading: secondRead.reading, imageBase64: secondRead.imageBase64, imageMime: secondRead.imageMime },
        hubRows,
        selectedHubRow,
        manualHubCount,
        manualPulseCount1,
        manualPulseCount2,
        manualFactor,
        overrideFirstRead,
        overrideSecondRead,
        overrideHubCount,
        overrideFactor,
        comments,
        accuracy,
        status: status.label,
      }));

      if (currentValidationId) {
        // Update existing
        const { error } = await supabase
          .from("validations")
          .update({
            name: validationName,
            settings: { ...siteInfo, meterMode: mode, toolType: "pulse" },
            validation_data: validationData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentValidationId);
        if (error) throw error;
        toast.success("Validation updated");
      } else {
        // Insert new
        const { data, error } = await supabase
          .from("validations")
          .insert([{
            user_id: user.id,
            name: validationName,
            status: "draft",
            readings: [] as any[],
            settings: { ...siteInfo, meterMode: mode, toolType: "pulse" },
            validation_data: validationData,
            comparison_data: [] as any[],
            bravegen_raw_data: [] as any[],
          }])
          .select("id")
          .single();
        if (error) throw error;
        if (data) setCurrentValidationId(data.id);
        toast.success("Validation saved to your account");
      }
    } catch (err: any) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyToClipboard = () => {
    const lines = [
      `Pulse Meter Validation Report`,
      `Mode: ${mode === "water" ? "Water" : "Gas"}`,
      ``, `Site Info`,
      `Feed: ${siteInfo.feed}`, `Serial Number: ${siteInfo.serialNumber}`,
      `Site: ${siteInfo.site}`, `Building: ${siteInfo.building}`,
      ``, `Physical Meter Readings`,
      `First Read Date: ${firstRead.dateTime}`, `First Read (${unit}): ${firstRead.reading}`,
      `Second Read Date: ${secondRead.dateTime}`, `Second Read (${unit}): ${secondRead.reading}`,
      `Physical Difference (${unit}): ${physicalDiff.toFixed(4)}`,
      ``, `BraveGen Hub Data`,
      `Load: ${activeHubRow?.load || "Manual Entry"}`,
      `Pulse Count 1: ${manualPulseCount1}`, `Pulse Count 2: ${manualPulseCount2}`,
      `Hub Pulse Count: ${hubCount}`, `Pulse Factor: ${factor}`,
      `Hub Volume (${unit}): ${hubVolume.toFixed(4)}`,
      ``, `Accuracy: ${accuracy.toFixed(2)}% — ${status.label}`,
      ``, `Comments: ${comments}`,
    ];
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Copied to clipboard");
  };

  const handleModeChange = (m: MeterMode) => {
    setMode(m);
    if (!overrideFactor && !activeHubRow) {
      setManualFactor(String(DEFAULT_FACTORS[m]));
    }
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
                Pulse Meter Validation
              </h1>
              <p className="text-xs text-muted-foreground">
                Water · Gas · Validate
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md border border-border overflow-hidden">
              <button
                onClick={() => handleModeChange("water")}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${mode === "water" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
              >
                <Droplets className="h-3.5 w-3.5" /> Water
              </button>
              <button
                onClick={() => handleModeChange("gas")}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${mode === "gas" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
              >
                <Flame className="h-3.5 w-3.5" /> Gas
              </button>
            </div>
            {user ? (
              <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")} className="gap-1.5">
                <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => navigate("/auth")} className="gap-1.5">
                <LogIn className="h-3.5 w-3.5" /> Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {/* Validation Name */}
        {user && (
          <div className="flex items-center gap-3">
            <Input
              value={validationName}
              onChange={e => setValidationName(e.target.value)}
              className="text-lg font-semibold bg-transparent border-none px-0 focus-visible:ring-0 max-w-md"
              placeholder="Validation name..."
            />
            <Button onClick={handleSave} disabled={isSaving} size="sm" className="gap-1.5">
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </Button>
          </div>
        )}

        {/* Site Info */}
        <Collapsible open={siteInfoOpen} onOpenChange={setSiteInfoOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer flex-row items-center justify-between py-3">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-primary" /> Site Information
                </CardTitle>
                {siteInfoOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-0">
                {(["feed", "serialNumber", "site", "building"] as const).map(key => (
                  <div key={key}>
                    <Label className="text-xs text-muted-foreground">{key === "serialNumber" ? "Serial Number" : key.charAt(0).toUpperCase() + key.slice(1)}</Label>
                    <Input
                      value={siteInfo[key]}
                      onChange={e => setSiteInfo(prev => ({ ...prev, [key]: e.target.value }))}
                      className="mt-1"
                      placeholder={key === "feed" ? "e.g. OKO" : key === "serialNumber" ? "e.g. O9824474" : key === "site" ? "e.g. 505 Mt Wellington Highway" : "e.g. J.A.Russels"}
                    />
                  </div>
                ))}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Section 1: Physical Meter Readings */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" /> Physical Meter Readings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(["first", "second"] as const).map(which => {
                const read = which === "first" ? firstRead : secondRead;
                const setRead = which === "first" ? setFirstRead : setSecondRead;
                const ref = which === "first" ? firstInputRef : secondInputRef;
                const isExtracting = which === "first" ? extractingFirst : extractingSecond;
                return (
                  <div key={which} className="space-y-3">
                    <p className="text-sm font-medium text-primary">{which === "first" ? "First Read" : "Second Read"}</p>
                    <div
                      className={`relative rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden cursor-pointer transition-colors h-44
                        ${read.image ? "border-primary" : "border-border bg-surface hover:border-primary/50"}`}
                      onDragOver={e => e.preventDefault()}
                      onDrop={handleImageDrop(which)}
                      onClick={() => { if (!read.image) ref.current?.click(); }}
                    >
                      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handleImageSelect(which)} />
                      {read.image ? (
                        <>
                          <img src={read.image} alt="Meter" className="w-full h-full object-cover cursor-zoom-in" onClick={e => { e.stopPropagation(); setLightboxImage(read.image); }} />
                          <button onClick={e => { e.stopPropagation(); removeImage(which); }} className="absolute top-1 right-1 rounded-full p-1 bg-background/80 hover:bg-background shadow">
                            <X className="h-4 w-4 text-destructive" />
                          </button>
                          {isExtracting && (
                            <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                              <div className="flex items-center gap-2 text-sm text-primary">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                <span>Reading meter...</span>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-center text-muted-foreground">
                          <Camera className="h-8 w-8 mx-auto mb-1 opacity-40" />
                          <p className="text-xs opacity-60">Drop meter photo here</p>
                        </div>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Reading Date & Time</Label>
                      <Input type="datetime-local" value={read.dateTime} onChange={e => setRead(prev => ({ ...prev, dateTime: e.target.value }))} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Meter Reading ({unit})</Label>
                      <Input type="number" step="any" value={read.reading} onChange={e => setRead(prev => ({ ...prev, reading: e.target.value }))} className="mt-1" placeholder="e.g. 5835.85" />
                    </div>
                  </div>
                );
              })}
            </div>
            {(firstRead.reading && secondRead.reading) && (
              <div className="mt-4 rounded-lg p-3 text-center bg-surface">
                <p className="text-sm text-muted-foreground">Physical Meter Difference</p>
                <p className="text-2xl font-bold text-primary">{physicalDiff.toFixed(4)} {unit}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 2: BraveGen Hub Data */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" /> BraveGen Hub Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="rounded-lg border-2 border-dashed p-6 text-center cursor-pointer border-border bg-surface hover:border-primary/50 transition-colors"
              onClick={() => hubInputRef.current?.click()}
            >
              <input ref={hubInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleHubFileUpload} />
              <Upload className="h-8 w-8 mx-auto mb-2 text-primary" />
              <p className="text-sm text-muted-foreground">{hubFile ? hubFile : "Drop or click to upload BraveGen export (.xlsx, .csv)"}</p>
            </div>

            {hubRows.length > 0 && (
              <div className="space-y-3">
                {hubRows.length > 1 && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Select Row</Label>
                    <Select value={String(selectedHubRow)} onValueChange={v => setSelectedHubRow(Number(v))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {hubRows.map((r, i) => <SelectItem key={i} value={String(i)}>{r.load}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {activeHubRow && (
                  <div className="rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm bg-surface">
                    <div><span className="text-xs text-muted-foreground">Load</span><p className="font-medium text-foreground">{activeHubRow.load}</p></div>
                    <div><span className="text-xs text-muted-foreground">Hub Count</span><p className="font-medium text-foreground">{activeHubRow.hubCount ?? "—"}</p></div>
                    <div><span className="text-xs text-muted-foreground">Factor</span><p className="font-medium text-foreground">{activeHubRow.factor ?? "—"}</p></div>
                    <div><span className="text-xs text-muted-foreground">Hub Volume</span><p className="font-medium text-foreground">{activeHubRow.hubVolume != null ? activeHubRow.hubVolume.toFixed(4) : "—"} {unit}</p></div>
                  </div>
                )}
              </div>
            )}

            {hubRows.length === 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Pulse Count 1</Label>
                    <Input type="number" value={manualPulseCount1} onChange={e => { setManualPulseCount1(e.target.value); setManualHubCount(""); }} className="mt-1" placeholder="e.g. 0" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Pulse Count 2</Label>
                    <Input type="number" value={manualPulseCount2} onChange={e => { setManualPulseCount2(e.target.value); setManualHubCount(""); }} className="mt-1" placeholder="e.g. 1270" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Hub Pulse Count (Diff)</Label>
                    <Input type="number" value={manualHubCount || (calculatedPulseDiff !== 0 ? String(calculatedPulseDiff) : "")} onChange={e => setManualHubCount(e.target.value)} className="mt-1" placeholder="Auto or manual" />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Pulse Factor ({unit}/pulse)</Label>
                    <Input type="number" step="any" value={manualFactor} onChange={e => setManualFactor(e.target.value)} className="mt-1" placeholder={mode === "water" ? "0.005" : "0.3"} />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 3: Validation Result */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Validation Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">First Read ({unit})</Label>
                <Input type="number" step="any" value={overrideFirstRead || firstRead.reading} onChange={e => setOverrideFirstRead(e.target.value)} className="mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Second Read ({unit})</Label>
                <Input type="number" step="any" value={overrideSecondRead || secondRead.reading} onChange={e => setOverrideSecondRead(e.target.value)} className="mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Hub Count</Label>
                <Input type="number" value={overrideHubCount || (activeHubRow ? String(activeHubRow.hubCount ?? "") : manualHubCount)} onChange={e => setOverrideHubCount(e.target.value)} className="mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Factor</Label>
                <Input type="number" step="any" value={overrideFactor || (activeHubRow ? String(activeHubRow.factor ?? "") : manualFactor)} onChange={e => setOverrideFactor(e.target.value)} className="mt-1 text-sm" />
              </div>
            </div>

            {physicalDiff > 0 && hubCount > 0 && (
              <>
                <div className="rounded-xl p-6 text-center bg-surface">
                  <p className="text-sm mb-1 text-muted-foreground">Accuracy</p>
                  <p className="text-5xl font-bold mb-2 text-primary">{accuracy.toFixed(2)}%</p>
                  <Badge className={`${status.color} text-sm px-3 py-1`}>{status.label}</Badge>
                </div>

                <div className="rounded-lg overflow-hidden border border-border">
                  <table className="w-full text-sm">
                    <tbody>
                      {[
                        ["Load", activeHubRow?.load || siteInfo.site || "Manual Entry"],
                        ["First Read Date", firstRead.dateTime ? new Date(firstRead.dateTime).toLocaleString() : "—"],
                        [`First Read (${unit})`, r1.toFixed(4)],
                        ["Second Read Date", secondRead.dateTime ? new Date(secondRead.dateTime).toLocaleString() : "—"],
                        [`Second Read (${unit})`, r2.toFixed(4)],
                        [`Physical Difference (${unit})`, physicalDiff.toFixed(4)],
                        ["Hub Pulse Count", hubCount.toString()],
                        ["Pulse Factor", factor.toString()],
                        [`Hub Volume (${unit})`, hubVolume.toFixed(4)],
                        ["Accuracy", `${accuracy.toFixed(2)}% — ${status.label}`],
                      ].map(([label, value], i) => (
                        <tr key={label} className={i % 2 === 0 ? "bg-surface" : "bg-card"}>
                          <td className="px-4 py-2 font-medium text-muted-foreground">{label}</td>
                          <td className="px-4 py-2 text-right text-foreground">{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Comments */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Comments / Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea value={comments} onChange={e => setComments(e.target.value)} placeholder="e.g. Bravegen data logger collecting pulses accurately at 99%" className="min-h-[80px]" />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 pb-8">
          <Button onClick={handleCopyToClipboard} className="gap-2">
            <Copy className="h-4 w-4" /> Copy to Clipboard
          </Button>
          {!user && (
            <Button variant="outline" onClick={() => navigate("/auth")} className="gap-2">
              <Save className="h-4 w-4" /> Sign In to Save
            </Button>
          )}
        </div>
      </main>

      {/* Lightbox */}
      <Dialog open={!!lightboxImage} onOpenChange={() => setLightboxImage(null)}>
        <DialogContent className="max-w-3xl p-2 bg-background border-border">
          {lightboxImage && <img src={lightboxImage} alt="Meter reading" className="w-full h-auto rounded" />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PulseMeter;
