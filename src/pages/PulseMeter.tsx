import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Droplets, Flame, Camera, X, Upload, FileSpreadsheet, ChevronDown, ChevronUp, Copy, Zap, Gauge } from "lucide-react";
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

const DEFAULT_FACTORS: Record<MeterMode, number> = { water: 0.005, gas: 0.3 };

const PulseMeter = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<MeterMode>("water");
  const [siteInfoOpen, setSiteInfoOpen] = useState(true);
  const [siteInfo, setSiteInfo] = useState<SiteInfo>({ feed: "", serialNumber: "", site: "", building: "" });

  // Section 1
  const [firstRead, setFirstRead] = useState<MeterRead>({ image: null, imageFile: null, dateTime: "", reading: "" });
  const [secondRead, setSecondRead] = useState<MeterRead>({ image: null, imageFile: null, dateTime: "", reading: "" });
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Section 2
  const [hubFile, setHubFile] = useState<string | null>(null);
  const [hubRows, setHubRows] = useState<HubRow[]>([]);
  const [selectedHubRow, setSelectedHubRow] = useState<number>(0);
  const [manualHubCount, setManualHubCount] = useState("");
  const [manualFactor, setManualFactor] = useState(String(DEFAULT_FACTORS["water"]));

  // Section 3 overrides
  const [overrideFirstRead, setOverrideFirstRead] = useState("");
  const [overrideSecondRead, setOverrideSecondRead] = useState("");
  const [overrideHubCount, setOverrideHubCount] = useState("");
  const [overrideFactor, setOverrideFactor] = useState("");

  // Comments
  const [comments, setComments] = useState("");

  const firstInputRef = useRef<HTMLInputElement>(null);
  const secondInputRef = useRef<HTMLInputElement>(null);

  const unit = mode === "water" ? "m³" : "NcM";
  const ModeIcon = mode === "water" ? Droplets : Flame;

  // Derived values
  const r1 = parseFloat(overrideFirstRead || firstRead.reading) || 0;
  const r2 = parseFloat(overrideSecondRead || secondRead.reading) || 0;
  const physicalDiff = r2 - r1;

  const activeHubRow = hubRows[selectedHubRow] || null;
  const hubCount = parseFloat(overrideHubCount || (activeHubRow ? String(activeHubRow.hubCount ?? "") : manualHubCount)) || 0;
  const factor = parseFloat(overrideFactor || (activeHubRow ? String(activeHubRow.factor ?? "") : manualFactor)) || 0;
  const hubVolume = hubCount * factor;
  const accuracy = physicalDiff !== 0 ? (hubVolume / physicalDiff) * 100 : 0;

  const getStatus = (acc: number) => {
    if (acc === 0) return { label: "N/A", color: "bg-muted text-muted-foreground" };
    if (acc >= 95 && acc <= 105) return { label: "PASS", color: "bg-emerald-500 text-white" };
    if ((acc >= 90 && acc < 95) || (acc > 105 && acc <= 110)) return { label: "MARGINAL", color: "bg-amber-500 text-white" };
    return { label: "FAIL", color: "bg-red-500 text-white" };
  };

  const status = getStatus(accuracy);

  // Image handling
  const handleImageDrop = useCallback((which: "first" | "second") => (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const setter = which === "first" ? setFirstRead : setSecondRead;
    setter(prev => ({ ...prev, image: url, imageFile: file }));
  }, []);

  const handleImageSelect = useCallback((which: "first" | "second") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const setter = which === "first" ? setFirstRead : setSecondRead;
    setter(prev => ({ ...prev, image: url, imageFile: file }));
  }, []);

  const removeImage = (which: "first" | "second") => {
    const setter = which === "first" ? setFirstRead : setSecondRead;
    setter(prev => ({ ...prev, image: null, imageFile: null }));
  };

  // Excel import
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

        // Find header row
        let headerIdx = -1;
        for (let i = 0; i < Math.min(json.length, 20); i++) {
          const row = (json[i] || []).map((c: any) => String(c).toLowerCase());
          if (row.some((c: string) => c.includes("load")) && row.some((c: string) => c.includes("hub") || c.includes("count") || c.includes("pulse"))) {
            headerIdx = i;
            break;
          }
        }

        if (headerIdx === -1) {
          // Try to find any numeric data rows
          toast.error("Could not find expected columns in the file. Please enter values manually.");
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

  // Copy to clipboard
  const handleCopyToClipboard = () => {
    const lines = [
      `Pulse Meter Validation Report`,
      `Mode: ${mode === "water" ? "Water" : "Gas"}`,
      ``,
      `Site Info`,
      `Feed: ${siteInfo.feed}`,
      `Serial Number: ${siteInfo.serialNumber}`,
      `Site: ${siteInfo.site}`,
      `Building: ${siteInfo.building}`,
      ``,
      `Physical Meter Readings`,
      `First Read Date: ${firstRead.dateTime}`,
      `First Read (${unit}): ${firstRead.reading}`,
      `Second Read Date: ${secondRead.dateTime}`,
      `Second Read (${unit}): ${secondRead.reading}`,
      `Physical Difference (${unit}): ${physicalDiff.toFixed(4)}`,
      ``,
      `BraveGen Hub Data`,
      `Load: ${activeHubRow?.load || "Manual Entry"}`,
      `Hub Pulse Count: ${hubCount}`,
      `Pulse Factor: ${factor}`,
      `Hub Volume (${unit}): ${hubVolume.toFixed(4)}`,
      ``,
      `Accuracy: ${accuracy.toFixed(2)}% — ${status.label}`,
      ``,
      `Comments: ${comments}`,
    ];
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Copied to clipboard");
  };

  // Mode change updates default factor
  const handleModeChange = (m: MeterMode) => {
    setMode(m);
    if (!overrideFactor && !activeHubRow) {
      setManualFactor(String(DEFAULT_FACTORS[m]));
    }
  };

  const hubInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="min-h-screen" style={{ background: "#F0F5F7" }}>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b" style={{ background: "#0D6E6E", borderColor: "#0A5A5A" }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ModeIcon className="h-7 w-7 text-white" />
            <h1 className="text-xl font-bold text-white tracking-tight">Pulse Meter Validation</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <Button
              size="sm"
              variant={mode === "water" ? "default" : "outline"}
              onClick={() => handleModeChange("water")}
              className={mode === "water" ? "bg-[#00BFA5] hover:bg-[#00A896] text-white border-none" : "text-white border-white/30 hover:bg-white/10"}
            >
              <Droplets className="h-4 w-4 mr-1" /> Water
            </Button>
            <Button
              size="sm"
              variant={mode === "gas" ? "default" : "outline"}
              onClick={() => handleModeChange("gas")}
              className={mode === "gas" ? "bg-[#F59E0B] hover:bg-[#D97706] text-white border-none" : "text-white border-white/30 hover:bg-white/10"}
            >
              <Flame className="h-4 w-4 mr-1" /> Gas
            </Button>
            {/* Nav */}
            <Button size="sm" variant="outline" className="text-white border-white/30 hover:bg-white/10 ml-2" onClick={() => navigate("/electricitytool")}>
              <Zap className="h-4 w-4 mr-1" /> Electricity Tool
            </Button>
          </div>
        </div>
      </header>

      {/* Wave divider */}
      <svg viewBox="0 0 1440 40" className="w-full -mb-1" style={{ color: "#0D6E6E" }}>
        <path d="M0,20 C360,40 720,0 1080,20 C1260,30 1360,25 1440,20 L1440,0 L0,0 Z" fill="currentColor" />
      </svg>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Site Info */}
        <Collapsible open={siteInfoOpen} onOpenChange={setSiteInfoOpen}>
          <Card style={{ borderColor: "#D1DEE6" }} className="bg-white">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer flex-row items-center justify-between py-3">
                <CardTitle className="text-base font-semibold" style={{ color: "#2D4A5E" }}>
                  <Gauge className="inline h-4 w-4 mr-2" />Site Information
                </CardTitle>
                {siteInfoOpen ? <ChevronUp className="h-4 w-4" style={{ color: "#2D4A5E" }} /> : <ChevronDown className="h-4 w-4" style={{ color: "#2D4A5E" }} />}
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-0">
                {(["feed", "serialNumber", "site", "building"] as const).map(key => (
                  <div key={key}>
                    <Label className="text-xs" style={{ color: "#2D4A5E" }}>{key === "serialNumber" ? "Serial Number" : key.charAt(0).toUpperCase() + key.slice(1)}</Label>
                    <Input
                      value={siteInfo[key]}
                      onChange={e => setSiteInfo(prev => ({ ...prev, [key]: e.target.value }))}
                      className="mt-1 bg-white border-[#D1DEE6] text-[#2D4A5E] focus-visible:ring-[#00BFA5]"
                      placeholder={key === "feed" ? "e.g. OKO" : key === "serialNumber" ? "e.g. O9824474" : key === "site" ? "e.g. 505 Mt Wellington Highway" : "e.g. J.A.Russels"}
                    />
                  </div>
                ))}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Section 1: Physical Meter Readings */}
        <Card style={{ borderColor: "#D1DEE6" }} className="bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold" style={{ color: "#2D4A5E" }}>
              <Camera className="inline h-4 w-4 mr-2" />Physical Meter Readings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(["first", "second"] as const).map(which => {
                const read = which === "first" ? firstRead : secondRead;
                const setRead = which === "first" ? setFirstRead : setSecondRead;
                const ref = which === "first" ? firstInputRef : secondInputRef;
                return (
                  <div key={which} className="space-y-3">
                    <p className="text-sm font-medium" style={{ color: "#0D6E6E" }}>{which === "first" ? "First Read" : "Second Read"}</p>
                    {/* Image drop zone */}
                    <div
                      className="relative rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden cursor-pointer transition-colors"
                      style={{ borderColor: read.image ? "#00BFA5" : "#D1DEE6", height: 180, background: read.image ? "transparent" : "#F7FAFA" }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={handleImageDrop(which)}
                      onClick={() => {
                        if (!read.image) ref.current?.click();
                      }}
                    >
                      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handleImageSelect(which)} />
                      {read.image ? (
                        <>
                          <img
                            src={read.image}
                            alt="Meter"
                            className="w-full h-full object-cover cursor-zoom-in"
                            onClick={(e) => { e.stopPropagation(); setLightboxImage(read.image); }}
                          />
                          <button
                            onClick={(e) => { e.stopPropagation(); removeImage(which); }}
                            className="absolute top-1 right-1 rounded-full p-1 bg-white/80 hover:bg-white shadow"
                          >
                            <X className="h-4 w-4 text-red-500" />
                          </button>
                        </>
                      ) : (
                        <div className="text-center" style={{ color: "#2D4A5E" }}>
                          <Camera className="h-8 w-8 mx-auto mb-1 opacity-40" />
                          <p className="text-xs opacity-60">Drop meter photo here</p>
                        </div>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs" style={{ color: "#2D4A5E" }}>Reading Date & Time</Label>
                      <Input
                        type="datetime-local"
                        value={read.dateTime}
                        onChange={e => setRead(prev => ({ ...prev, dateTime: e.target.value }))}
                        className="mt-1 bg-white border-[#D1DEE6] text-[#2D4A5E] focus-visible:ring-[#00BFA5]"
                      />
                    </div>
                    <div>
                      <Label className="text-xs" style={{ color: "#2D4A5E" }}>Meter Reading ({unit})</Label>
                      <Input
                        type="number"
                        step="any"
                        value={read.reading}
                        onChange={e => setRead(prev => ({ ...prev, reading: e.target.value }))}
                        className="mt-1 bg-white border-[#D1DEE6] text-[#2D4A5E] focus-visible:ring-[#00BFA5]"
                        placeholder="e.g. 5835.85"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Difference */}
            {(firstRead.reading && secondRead.reading) && (
              <div className="mt-4 rounded-lg p-3 text-center" style={{ background: "#E6F7F5" }}>
                <p className="text-sm" style={{ color: "#2D4A5E" }}>Physical Meter Difference</p>
                <p className="text-2xl font-bold" style={{ color: "#0D6E6E" }}>{physicalDiff.toFixed(4)} {unit}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 2: BraveGen Hub Data */}
        <Card style={{ borderColor: "#D1DEE6" }} className="bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold" style={{ color: "#2D4A5E" }}>
              <FileSpreadsheet className="inline h-4 w-4 mr-2" />BraveGen Hub Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* File upload */}
            <div
              className="rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors"
              style={{ borderColor: "#D1DEE6", background: "#F7FAFA" }}
              onClick={() => hubInputRef.current?.click()}
            >
              <input ref={hubInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleHubFileUpload} />
              <Upload className="h-8 w-8 mx-auto mb-2" style={{ color: "#00BFA5" }} />
              <p className="text-sm" style={{ color: "#2D4A5E" }}>{hubFile ? hubFile : "Drop or click to upload BraveGen export (.xlsx, .csv)"}</p>
            </div>

            {/* Imported data */}
            {hubRows.length > 0 && (
              <div className="space-y-3">
                {hubRows.length > 1 && (
                  <div>
                    <Label className="text-xs" style={{ color: "#2D4A5E" }}>Select Row</Label>
                    <Select value={String(selectedHubRow)} onValueChange={v => setSelectedHubRow(Number(v))}>
                      <SelectTrigger className="mt-1 bg-white border-[#D1DEE6] text-[#2D4A5E]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {hubRows.map((r, i) => (
                          <SelectItem key={i} value={String(i)}>{r.load}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {activeHubRow && (
                  <div className="rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm" style={{ background: "#E6F7F5" }}>
                    <div><span className="text-xs opacity-60" style={{ color: "#2D4A5E" }}>Load</span><p className="font-medium" style={{ color: "#0D6E6E" }}>{activeHubRow.load}</p></div>
                    <div><span className="text-xs opacity-60" style={{ color: "#2D4A5E" }}>Hub Count</span><p className="font-medium" style={{ color: "#0D6E6E" }}>{activeHubRow.hubCount ?? "—"}</p></div>
                    <div><span className="text-xs opacity-60" style={{ color: "#2D4A5E" }}>Factor</span><p className="font-medium" style={{ color: "#0D6E6E" }}>{activeHubRow.factor ?? "—"}</p></div>
                    <div><span className="text-xs opacity-60" style={{ color: "#2D4A5E" }}>Hub Volume</span><p className="font-medium" style={{ color: "#0D6E6E" }}>{activeHubRow.hubVolume != null ? activeHubRow.hubVolume.toFixed(4) : "—"} {unit}</p></div>
                  </div>
                )}
              </div>
            )}

            {/* Manual entry */}
            {hubRows.length === 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs" style={{ color: "#2D4A5E" }}>Hub Pulse Count</Label>
                  <Input
                    type="number"
                    value={manualHubCount}
                    onChange={e => setManualHubCount(e.target.value)}
                    className="mt-1 bg-white border-[#D1DEE6] text-[#2D4A5E] focus-visible:ring-[#00BFA5]"
                    placeholder="e.g. 1270"
                  />
                </div>
                <div>
                  <Label className="text-xs" style={{ color: "#2D4A5E" }}>Pulse Factor ({unit}/pulse)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={manualFactor}
                    onChange={e => setManualFactor(e.target.value)}
                    className="mt-1 bg-white border-[#D1DEE6] text-[#2D4A5E] focus-visible:ring-[#00BFA5]"
                    placeholder={mode === "water" ? "0.005" : "0.3"}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 3: Validation Result */}
        <Card style={{ borderColor: "#D1DEE6" }} className="bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold" style={{ color: "#2D4A5E" }}>Validation Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Override inputs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs" style={{ color: "#2D4A5E" }}>First Read ({unit})</Label>
                <Input type="number" step="any" value={overrideFirstRead || firstRead.reading} onChange={e => setOverrideFirstRead(e.target.value)}
                  className="mt-1 bg-white border-[#D1DEE6] text-[#2D4A5E] focus-visible:ring-[#00BFA5] text-sm" />
              </div>
              <div>
                <Label className="text-xs" style={{ color: "#2D4A5E" }}>Second Read ({unit})</Label>
                <Input type="number" step="any" value={overrideSecondRead || secondRead.reading} onChange={e => setOverrideSecondRead(e.target.value)}
                  className="mt-1 bg-white border-[#D1DEE6] text-[#2D4A5E] focus-visible:ring-[#00BFA5] text-sm" />
              </div>
              <div>
                <Label className="text-xs" style={{ color: "#2D4A5E" }}>Hub Count</Label>
                <Input type="number" value={overrideHubCount || (activeHubRow ? String(activeHubRow.hubCount ?? "") : manualHubCount)}
                  onChange={e => setOverrideHubCount(e.target.value)}
                  className="mt-1 bg-white border-[#D1DEE6] text-[#2D4A5E] focus-visible:ring-[#00BFA5] text-sm" />
              </div>
              <div>
                <Label className="text-xs" style={{ color: "#2D4A5E" }}>Factor</Label>
                <Input type="number" step="any" value={overrideFactor || (activeHubRow ? String(activeHubRow.factor ?? "") : manualFactor)}
                  onChange={e => setOverrideFactor(e.target.value)}
                  className="mt-1 bg-white border-[#D1DEE6] text-[#2D4A5E] focus-visible:ring-[#00BFA5] text-sm" />
              </div>
            </div>

            {/* Result display */}
            {physicalDiff > 0 && hubCount > 0 && (
              <>
                <div className="rounded-xl p-6 text-center" style={{ background: "linear-gradient(135deg, #E6F7F5, #F0F5F7)" }}>
                  <p className="text-sm mb-1" style={{ color: "#2D4A5E" }}>Accuracy</p>
                  <p className="text-5xl font-bold mb-2" style={{ color: "#0D6E6E" }}>{accuracy.toFixed(2)}%</p>
                  <Badge className={`${status.color} text-sm px-3 py-1`}>{status.label}</Badge>
                </div>

                {/* Summary table */}
                <div className="rounded-lg overflow-hidden border" style={{ borderColor: "#D1DEE6" }}>
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
                        <tr key={label} style={{ background: i % 2 === 0 ? "#F7FAFA" : "#FFFFFF" }}>
                          <td className="px-4 py-2 font-medium" style={{ color: "#2D4A5E" }}>{label}</td>
                          <td className="px-4 py-2 text-right" style={{ color: "#0D6E6E" }}>{value}</td>
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
        <Card style={{ borderColor: "#D1DEE6" }} className="bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold" style={{ color: "#2D4A5E" }}>Comments / Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={comments}
              onChange={e => setComments(e.target.value)}
              placeholder="e.g. Bravegen data logger collecting pulses accurately at 99%"
              className="bg-white border-[#D1DEE6] text-[#2D4A5E] focus-visible:ring-[#00BFA5] min-h-[80px]"
            />
          </CardContent>
        </Card>

        {/* Export */}
        <div className="flex gap-3 pb-8">
          <Button onClick={handleCopyToClipboard} style={{ background: "#0D6E6E" }} className="text-white hover:opacity-90">
            <Copy className="h-4 w-4 mr-2" /> Copy to Clipboard
          </Button>
        </div>
      </main>

      {/* Lightbox */}
      <Dialog open={!!lightboxImage} onOpenChange={() => setLightboxImage(null)}>
        <DialogContent className="max-w-3xl p-2 bg-black/90 border-none">
          {lightboxImage && <img src={lightboxImage} alt="Meter reading" className="w-full h-auto rounded" />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PulseMeter;
