import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, ArrowRightLeft, X, Plus, Trash2, Calculator, Wand2 } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { MeterReading } from "@/types/meter";

interface BravegenRow {
  event: string;
  eventDate: Date | null;
  loadName: string;
  channelKey: string;
  reference: string;
  utilityType: string;
  unit: string;
  usage: number | null;
}

interface ComparisonRow {
  id: string;
  bravegenKey: string; // "loadName||eventISO" unique key
  extractedId: string; // reading.id from extracted data
  calculated: boolean;
  accuracy: number | null;
  bravegenUsage: number | null;
  extractedReading: number | null;
}

interface BravegenComparisonProps {
  readings: MeterReading[];
}

function parseDate(val: any): Date | null {
  if (val == null || val === "") return null;
  if (typeof val === "number") {
    const epoch = new Date(1899, 11, 30);
    return new Date(epoch.getTime() + val * 86400000);
  }
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const s = String(val).trim();

  // dd/MM/yyyy HH:mm or dd/MM/yyyy HH:mm:ss
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m1) return new Date(+m1[3], +m1[2] - 1, +m1[1], +m1[4], +m1[5], +(m1[6] || 0));

  // dd/MM/yyyy (no time)
  const m1b = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1b) return new Date(+m1b[3], +m1b[2] - 1, +m1b[1]);

  // dd/M/yy HHMM  (e.g. "24/2/26 0950")
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{3,4})$/);
  if (m2) {
    let yr = +m2[3];
    yr = yr < 70 ? 2000 + yr : 1900 + yr;
    const timeStr = m2[4].padStart(4, "0");
    const hr = +timeStr.slice(0, 2);
    const mn = +timeStr.slice(2, 4);
    return new Date(yr, +m2[2] - 1, +m2[1], hr, mn, 0);
  }

  // dd/M/yy HH:mm  (e.g. "24/2/26 09:50")
  const m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m3) {
    let yr = +m3[3];
    yr = yr < 70 ? 2000 + yr : 1900 + yr;
    return new Date(yr, +m3[2] - 1, +m3[1], +m3[4], +m3[5], +(m3[6] || 0));
  }

  // dd/M/yy (no time, 2-digit year)
  const m4 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m4) {
    let yr = +m4[3];
    yr = yr < 70 ? 2000 + yr : 1900 + yr;
    return new Date(yr, +m4[2] - 1, +m4[1]);
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("en-NZ", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function norm(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findCol(headers: string[], ...variants: string[]): string | undefined {
  for (const v of variants) {
    const found = headers.find((h) => norm(h) === norm(v));
    if (found) return found;
  }
  for (const v of variants) {
    const n = norm(v);
    const found = headers.find((h) => norm(h).includes(n) || n.includes(norm(h)));
    if (found) return found;
  }
  return undefined;
}

/** Build a unique key for a BraveGen row */
function bgKey(row: BravegenRow, idx: number): string {
  return `${row.loadName}||${row.eventDate?.toISOString() ?? idx}`;
}

const BravegenComparison = ({ readings }: BravegenComparisonProps) => {
  const [bravegenData, setBravegenData] = useState<BravegenRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [comparisonRows, setComparisonRows] = useState<ComparisonRow[]>([]);

  const processRows = useCallback((json: any[]) => {
    if (json.length === 0) return;
    const headers = Object.keys(json[0]);
    const eventCol = findCol(headers, "Event");
    const loadCol = findCol(headers, "Load/Channel Name", "LoadChannelName", "Load Channel Name");
    const keyCol = findCol(headers, "Channel Key", "ChannelKey");
    const refCol = findCol(headers, "Reference", "Reference Utility Type");
    const typeCol = findCol(headers, "Utility Type", "UtilityType");
    const unitCol = findCol(headers, "Unit");
    const usageCol = findCol(headers, "Usage");

    const rows: BravegenRow[] = json.map((row) => {
      const rawEvent = eventCol ? row[eventCol] : null;
      const eventDate = parseDate(rawEvent);
      const usageVal = usageCol ? row[usageCol] : null;
      return {
        event: eventDate ? formatDateTime(eventDate) : String(rawEvent ?? ""),
        eventDate,
        loadName: String((loadCol ? row[loadCol] : "") ?? ""),
        channelKey: String((keyCol ? row[keyCol] : "") ?? ""),
        reference: String((refCol ? row[refCol] : "") ?? ""),
        utilityType: String((typeCol ? row[typeCol] : "") ?? ""),
        unit: String((unitCol ? row[unitCol] : "") ?? ""),
        usage: usageVal != null && usageVal !== "" ? parseFloat(String(usageVal)) : null,
      };
    }).filter((r) => r.loadName || r.usage != null);

    setBravegenData(rows);
    setComparisonRows([]);
  }, []);

  const handleFile = useCallback((file: File) => {
    const isCSV = file.name.match(/\.csv$/i);
    const isExcel = file.name.match(/\.xlsx?$/i);
    if (!isCSV && !isExcel) {
      toast.error("Please upload a .csv or .xlsx file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = isCSV
          ? XLSX.read((e.target?.result as string).replace(/^\uFEFF/, ""), { type: "string" })
          : XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });
        processRows(json);
        setFileName(file.name);
        toast.success(`Loaded ${json.length} rows from ${file.name}`);
      } catch {
        toast.error("Failed to parse file.");
      }
    };
    isCSV ? reader.readAsText(file) : reader.readAsArrayBuffer(file);
  }, [processRows]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // Comparison row management
  const addComparisonRow = () => {
    setComparisonRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        bravegenKey: "",
        extractedId: "",
        calculated: false,
        accuracy: null,
        bravegenUsage: null,
        extractedReading: null,
      },
    ]);
  };

  const removeComparisonRow = (id: string) => {
    setComparisonRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateComparisonRow = (id: string, field: "bravegenKey" | "extractedId", value: string) => {
    setComparisonRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value, calculated: false, accuracy: null } : r))
    );
  };

  /** Fuzzy similarity score between two strings (0-1) */
  const similarity = (a: string, b: string): number => {
    const na = norm(a);
    const nb = norm(b);
    if (na === nb) return 1;
    if (na.includes(nb) || nb.includes(na)) return 0.8;
    const bigrams = (s: string) => {
      const set = new Set<string>();
      for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
      return set;
    };
    const bg1 = bigrams(na);
    const bg2 = bigrams(nb);
    if (bg1.size === 0 || bg2.size === 0) return 0;
    let overlap = 0;
    bg1.forEach((b) => { if (bg2.has(b)) overlap++; });
    return (2 * overlap) / (bg1.size + bg2.size);
  };

  /** Round a date down to the nearest 15-min interval */
  const roundTo15Min = (d: Date): Date => {
    const ms = d.getTime();
    const mins = d.getMinutes();
    const rounded = mins - (mins % 15);
    const out = new Date(ms);
    out.setMinutes(rounded, 0, 0);
    return out;
  };

  /** Auto-match: for each extracted reading, find the BraveGen row with best name match,
   *  then pick the one whose time is nearest (rounded to 15-min intervals). */
  const handleAutoMatch = () => {
    if (readings.length === 0 || bravegenData.length === 0) {
      toast.error("Need both extracted data and BraveGen data to auto-match.");
      return;
    }

    const newRows: ComparisonRow[] = readings.map((reading) => {
      const readingDate = reading.dateTime ? parseDate(reading.dateTime) : null;
      // Round the extracted reading time down to the nearest 15-min BraveGen interval
      const readingRounded = readingDate ? roundTo15Min(readingDate) : null;

      // Step 1: Find all BraveGen rows with good name similarity
      const candidates: { bg: BravegenRow; idx: number; nameSim: number }[] = [];
      bravegenData.forEach((bg, i) => {
        const nameSim = similarity(reading.loadName, bg.loadName);
        if (nameSim >= 0.3) candidates.push({ bg, idx: i, nameSim });
      });

      if (candidates.length === 0) {
        return {
          id: crypto.randomUUID(),
          bravegenKey: "",
          extractedId: reading.id,
          calculated: false,
          accuracy: null,
          bravegenUsage: null,
          extractedReading: null,
        };
      }

      // Step 2: Among name-matched candidates, find the one with the closest time
      // to the extracted reading's rounded-down 15-min interval
      let bestKey = "";
      let bestTimeDiff = Infinity;
      let bestNameSim = -1;

      for (const c of candidates) {
        if (readingRounded && c.bg.eventDate) {
          const diff = Math.abs(readingRounded.getTime() - c.bg.eventDate.getTime());
          // Among candidates with similar name scores, pick closest time
          if (diff < bestTimeDiff || (diff === bestTimeDiff && c.nameSim > bestNameSim)) {
            bestTimeDiff = diff;
            bestNameSim = c.nameSim;
            bestKey = bgKey(c.bg, c.idx);
          }
        } else if (bestTimeDiff === Infinity && c.nameSim > bestNameSim) {
          bestNameSim = c.nameSim;
          bestKey = bgKey(c.bg, c.idx);
        }
      }

      return {
        id: crypto.randomUUID(),
        bravegenKey: bestKey,
        extractedId: reading.id,
        calculated: false,
        accuracy: null,
        bravegenUsage: null,
        extractedReading: null,
      };
    });

    setComparisonRows(newRows);
    toast.success(`Auto-matched ${newRows.filter((r) => r.bravegenKey).length} of ${readings.length} readings`);
  };

  const handleCalculateAll = () => {
    setComparisonRows((prev) =>
      prev.map((row) => {
        const bgIdx = bravegenData.findIndex((bg, i) => bgKey(bg, i) === row.bravegenKey);
        const bg = bgIdx >= 0 ? bravegenData[bgIdx] : null;
        const extracted = readings.find((r) => r.id === row.extractedId);

        if (!bg || !extracted || bg.usage == null || extracted.physicalMeterRead == null) {
          return { ...row, calculated: true, accuracy: null, bravegenUsage: bg?.usage ?? null, extractedReading: extracted?.physicalMeterRead ?? null };
        }

        const accuracy = extracted.physicalMeterRead !== 0
          ? (bg.usage / extracted.physicalMeterRead) * 100
          : null;

        return {
          ...row,
          calculated: true,
          accuracy,
          bravegenUsage: bg.usage,
          extractedReading: extracted.physicalMeterRead,
        };
      })
    );
  };

  const getAccuracyColor = (val: number) => {
    if (val >= 95 && val <= 105) return "bg-green-600/20 text-green-400 border-green-600/40";
    if ((val >= 90 && val < 95) || (val > 105 && val <= 110)) return "bg-yellow-600/20 text-yellow-400 border-yellow-600/40";
    return "bg-red-600/20 text-red-400 border-red-600/40";
  };

  const clearData = () => {
    setBravegenData([]);
    setFileName(null);
    setComparisonRows([]);
  };

  // Build BraveGen dropdown options
  const bravegenOptions = bravegenData.map((row, i) => ({
    key: bgKey(row, i),
    label: `${row.loadName} — ${row.event} — ${row.usage?.toLocaleString() ?? "?"} kWh`,
  }));

  // Build extracted data dropdown options
  const extractedOptions = readings.map((r) => ({
    key: r.id,
    label: `${r.loadName}${r.physicalMeterRead != null ? ` — ${r.physicalMeterRead} kWh` : ""}${r.dateTime ? ` (${r.dateTime})` : ""}`,
  }));

  const anyCalculated = comparisonRows.some((r) => r.calculated);

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="bg-secondary px-5 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-foreground tracking-tight flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            BraveGen Data Comparison
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Upload a BraveGen export, then map rows to extracted data for accuracy comparison.
          </p>
        </div>
        {fileName && (
          <Button variant="ghost" size="sm" onClick={clearData} className="gap-1.5 text-muted-foreground hover:text-destructive">
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Upload area */}
      {!fileName ? (
        <div
          className={`m-4 rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
            isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById("bravegen-file-input")?.click()}
        >
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-1">Drop a BraveGen export here, or click to browse</p>
          <p className="text-xs text-muted-foreground/70">.csv, .xlsx, or .xls files</p>
          <input id="bravegen-file-input" type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileInput} />
        </div>
      ) : (
        <div className="px-5 py-3 space-y-4">
          {/* File info */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              <span className="text-sm font-mono text-foreground">{fileName}</span>
              <Badge variant="secondary" className="text-xs">{bravegenData.length} rows</Badge>
            </div>
          </div>

          {/* BraveGen data preview (collapsed) */}
          {bravegenData.length > 0 && (
            <details className="group">
              <summary className="text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors">
                BraveGen Data Preview ({bravegenData.length} rows)
              </summary>
              <div className="mt-2 rounded-md border border-border overflow-x-auto max-h-48 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                      <TableHead className="text-xs font-semibold">Event Time</TableHead>
                      <TableHead className="text-xs font-semibold">Load/Channel</TableHead>
                      <TableHead className="text-xs font-semibold">Unit</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Usage (kWh)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bravegenData.map((row, i) => (
                      <TableRow key={i} className="hover:bg-surface-elevated">
                        <TableCell className="font-mono text-xs">{row.event}</TableCell>
                        <TableCell className="text-xs">{row.loadName}</TableCell>
                        <TableCell className="text-xs">{row.unit}</TableCell>
                        <TableCell className="font-mono text-xs text-right">{row.usage?.toLocaleString() ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>
          )}

          {/* Comparison mapping table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Comparison Mapping
                {comparisonRows.length > 0 && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary">
                    {comparisonRows.length} rows
                  </span>
                )}
              </h4>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAutoMatch}
                  disabled={readings.length === 0 || bravegenData.length === 0}
                  className="gap-1.5"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Auto-Match
                </Button>
                <Button variant="outline" size="sm" onClick={addComparisonRow} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Add Row
                </Button>
              </div>
            </div>

            {comparisonRows.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Click "Add Row" to start mapping BraveGen readings to extracted data.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/60">
                      <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider w-8">#</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider">BraveGen Reading (Date/Load/kWh)</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider">Extracted Data (Load/kWh)</th>
                      {anyCalculated && (
                        <>
                          <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground text-xs uppercase tracking-wider">Accuracy</th>
                          <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                        </>
                      )}
                      <th className="px-3 py-2.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {comparisonRows.map((row, i) => (
                      <tr key={row.id} className="hover:bg-surface-elevated">
                        <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{i + 1}</td>
                        <td className="px-3 py-2">
                          <Select value={row.bravegenKey} onValueChange={(v) => updateComparisonRow(row.id, "bravegenKey", v)}>
                            <SelectTrigger className="h-8 w-full bg-card border-border text-xs">
                              <SelectValue placeholder="Select BraveGen reading..." />
                            </SelectTrigger>
                            <SelectContent>
                              {bravegenOptions.map((opt) => (
                                <SelectItem key={opt.key} value={opt.key} className="text-xs">
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          <Select value={row.extractedId} onValueChange={(v) => updateComparisonRow(row.id, "extractedId", v)}>
                            <SelectTrigger className="h-8 w-full bg-card border-border text-xs">
                              <SelectValue placeholder="Select extracted reading..." />
                            </SelectTrigger>
                            <SelectContent>
                              {extractedOptions.map((opt) => (
                                <SelectItem key={opt.key} value={opt.key} className="text-xs">
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        {anyCalculated && (
                          <>
                            <td className="px-3 py-2 text-center">
                              {row.calculated && row.accuracy != null ? (
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-mono font-bold border ${getAccuracyColor(row.accuracy)}`}>
                                  {row.accuracy.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {row.calculated && row.accuracy != null ? (
                                <Badge
                                  variant={row.accuracy >= 95 && row.accuracy <= 105 ? "default" : "destructive"}
                                  className={row.accuracy >= 95 && row.accuracy <= 105 ? "bg-green-600 hover:bg-green-700" : ""}
                                >
                                  {row.accuracy >= 95 && row.accuracy <= 105 ? "PASS" : "FAIL"}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">—</Badge>
                              )}
                            </td>
                          </>
                        )}
                        <td className="px-3 py-2">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeComparisonRow(row.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Calculate button */}
            {comparisonRows.length > 0 && (
              <div className="flex items-center justify-between border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  Accuracy = (BraveGen kWh ÷ Extracted kWh) × 100
                </p>
                <Button onClick={handleCalculateAll} size="sm" className={`gap-2 ${!anyCalculated ? "animate-pulse" : ""}`}>
                  <Calculator className="h-3.5 w-3.5" />
                  {anyCalculated ? "Recalculate" : "Calculate Accuracy"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BravegenComparison;
