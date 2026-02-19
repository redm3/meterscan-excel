import { useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, ArrowRightLeft, X } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

interface BravegenComparisonProps {
  readings: MeterReading[];
}

/**
 * Parse dates like "20/02/2026 00:15:00" (dd/MM/yyyy HH:mm:ss)
 * or ISO or Excel serial numbers.
 */
function parseDate(val: any): Date | null {
  if (val == null || val === "") return null;
  // Excel serial number
  if (typeof val === "number") {
    const epoch = new Date(1899, 11, 30);
    return new Date(epoch.getTime() + val * 86400000);
  }
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const s = String(val).trim();
  // dd/MM/yyyy HH:mm:ss
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0));
  }
  // yyyy-MM-dd or ISO
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("en-NZ", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

/** Normalise header for flexible column matching */
function norm(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Find a column name from headers by checking normalised variants */
function findCol(headers: string[], ...variants: string[]): string | undefined {
  for (const v of variants) {
    const found = headers.find((h) => norm(h) === norm(v));
    if (found) return found;
  }
  // partial match fallback
  for (const v of variants) {
    const n = norm(v);
    const found = headers.find((h) => norm(h).includes(n) || n.includes(norm(h)));
    if (found) return found;
  }
  return undefined;
}

const BravegenComparison = ({ readings }: BravegenComparisonProps) => {
  const [bravegenData, setBravegenData] = useState<BravegenRow[]>([]);
  const [uniqueLoads, setUniqueLoads] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  /** Parse CSV or XLSX rows into BravegenRow[] */
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
    setUniqueLoads([...new Set(rows.map((r) => r.loadName).filter(Boolean))]);
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
        if (isCSV) {
          const text = e.target?.result as string;
          // Remove BOM if present
          const clean = text.replace(/^\uFEFF/, "");
          const wb = XLSX.read(clean, { type: "string" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });
          processRows(json);
          setFileName(file.name);
          toast.success(`Loaded ${json.length} rows from ${file.name}`);
        } else {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array", cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });
          processRows(json);
          setFileName(file.name);
          toast.success(`Loaded ${json.length} rows from ${file.name}`);
        }
      } catch (err) {
        console.error("File parse error:", err);
        toast.error("Failed to parse file.");
      }
    };

    if (isCSV) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  }, [processRows]);

  /**
   * Compare: for each extracted reading, find the BraveGen row with the
   * closest timestamp (by load name fuzzy match). The "accuracy" is
   * how close the BraveGen cumulative reading is to the extracted kWh.
   */
  const comparisons = useMemo(() => {
    if (bravegenData.length === 0 || readings.length === 0) return [];

    return readings.map((reading) => {
      const rName = norm(reading.loadName);

      // Find all BraveGen rows for this load (fuzzy name match)
      const candidates = bravegenData.filter((bg) => {
        const bgN = norm(bg.loadName);
        return bgN.includes(rName) || rName.includes(bgN);
      });

      if (candidates.length === 0 || reading.physicalMeterRead == null) {
        return {
          loadName: reading.loadName,
          extractedReading: reading.physicalMeterRead,
          extractedDateTime: reading.dateTime,
          bravegenReading: null,
          bravegenDateTime: null,
          accuracy: null,
          matched: false,
        };
      }

      // Parse the extracted reading's datetime
      const extractedDate = parseDate(reading.dateTime);

      // Find the BraveGen row closest in time
      let bestMatch = candidates[0];
      if (extractedDate && candidates.some((c) => c.eventDate)) {
        let bestDiff = Infinity;
        for (const c of candidates) {
          if (!c.eventDate) continue;
          const diff = Math.abs(c.eventDate.getTime() - extractedDate.getTime());
          if (diff < bestDiff) {
            bestDiff = diff;
            bestMatch = c;
          }
        }
      }

      if (bestMatch.usage == null) {
        return {
          loadName: reading.loadName,
          extractedReading: reading.physicalMeterRead,
          extractedDateTime: reading.dateTime,
          bravegenReading: null,
          bravegenDateTime: bestMatch.event,
          accuracy: null,
          matched: true,
        };
      }

      // Accuracy: how close the BraveGen cumulative kWh is to extracted
      const accuracy = reading.physicalMeterRead !== 0
        ? (bestMatch.usage / reading.physicalMeterRead) * 100
        : null;

      return {
        loadName: reading.loadName,
        extractedReading: reading.physicalMeterRead,
        extractedDateTime: reading.dateTime,
        bravegenReading: bestMatch.usage,
        bravegenDateTime: bestMatch.event,
        accuracy,
        matched: true,
      };
    });
  }, [bravegenData, readings]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const getAccuracyColor = (val: number) => {
    if (val >= 95 && val <= 105) return "bg-green-600/20 text-green-400 border-green-600/40";
    if ((val >= 90 && val < 95) || (val > 105 && val <= 110)) return "bg-yellow-600/20 text-yellow-400 border-yellow-600/40";
    return "bg-red-600/20 text-red-400 border-red-600/40";
  };

  const clearData = () => {
    setBravegenData([]);
    setUniqueLoads([]);
    setFileName(null);
  };

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
            Upload a BraveGen CSV or Excel export to compare readings with extracted data.
          </p>
        </div>
        {fileName && (
          <Button variant="ghost" size="sm" onClick={clearData} className="gap-1.5 text-muted-foreground hover:text-destructive">
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Upload area or loaded file info */}
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
          <p className="text-sm text-muted-foreground mb-1">
            Drop a BraveGen export here, or click to browse
          </p>
          <p className="text-xs text-muted-foreground/70">.csv, .xlsx, or .xls files</p>
          <input
            id="bravegen-file-input"
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>
      ) : (
        <div className="px-5 py-3 space-y-3">
          {/* File info */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              <span className="text-sm font-mono text-foreground">{fileName}</span>
              <Badge variant="secondary" className="text-xs">{bravegenData.length} rows</Badge>
              {uniqueLoads.length > 0 && (
                <Badge variant="outline" className="text-xs">{uniqueLoads.length} loads</Badge>
              )}
            </div>
          </div>

          {/* Bravegen data preview */}
          {bravegenData.length > 0 && (
            <div className="rounded-md border border-border overflow-x-auto max-h-48 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                    <TableHead className="text-xs font-semibold">Event Time</TableHead>
                    <TableHead className="text-xs font-semibold">Load/Channel</TableHead>
                    <TableHead className="text-xs font-semibold">Channel Key</TableHead>
                    <TableHead className="text-xs font-semibold">Utility Type</TableHead>
                    <TableHead className="text-xs font-semibold">Unit</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Usage (kWh)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bravegenData.map((row, i) => (
                    <TableRow key={i} className="hover:bg-surface-elevated">
                      <TableCell className="font-mono text-xs">{row.event}</TableCell>
                      <TableCell className="text-xs">{row.loadName}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.channelKey}</TableCell>
                      <TableCell className="text-xs">{row.utilityType}</TableCell>
                      <TableCell className="text-xs">{row.unit}</TableCell>
                      <TableCell className="font-mono text-xs text-right">{row.usage?.toLocaleString() ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Comparison results */}
          {comparisons.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Comparison Results — Nearest Time Match
              </h4>
              <div className="rounded-md border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                      <TableHead className="text-xs font-semibold">Load Name</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Extracted kWh</TableHead>
                      <TableHead className="text-xs font-semibold">Extracted Time</TableHead>
                      <TableHead className="text-xs font-semibold text-right">BraveGen kWh</TableHead>
                      <TableHead className="text-xs font-semibold">BraveGen Time</TableHead>
                      <TableHead className="text-xs font-semibold text-center">Accuracy</TableHead>
                      <TableHead className="text-xs font-semibold text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparisons.map((comp, i) => (
                      <TableRow key={i} className="hover:bg-surface-elevated">
                        <TableCell className="text-sm font-medium">{comp.loadName}</TableCell>
                        <TableCell className="font-mono text-sm text-right">
                          {comp.extractedReading?.toLocaleString() ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {comp.extractedDateTime ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-right">
                          {comp.bravegenReading?.toLocaleString() ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {comp.bravegenDateTime ?? "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {comp.accuracy != null ? (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-mono font-bold border ${getAccuracyColor(comp.accuracy)}`}>
                              {comp.accuracy.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {comp.accuracy != null ? (
                            <Badge
                              variant={comp.accuracy >= 95 && comp.accuracy <= 105 ? "default" : "destructive"}
                              className={comp.accuracy >= 95 && comp.accuracy <= 105 ? "bg-green-600 hover:bg-green-700" : ""}
                            >
                              {comp.accuracy >= 95 && comp.accuracy <= 105 ? "PASS" : "FAIL"}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">No Match</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BravegenComparison;
