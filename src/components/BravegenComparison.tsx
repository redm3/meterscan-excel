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
  loadName: string;
  channelKey: string;
  referenceUtilityType: string;
  unit: string;
  usage: number | null;
  dateTime: string;
}

interface BravegenComparisonProps {
  readings: MeterReading[];
}

/** Try to parse an Excel serial date or a string date */
function parseDate(val: any): Date | null {
  if (val == null) return null;
  // Excel serial number
  if (typeof val === "number") {
    const epoch = new Date(1899, 11, 30);
    return new Date(epoch.getTime() + val * 86400000);
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/** Round a date to the nearest hour */
function roundToNearestHour(d: Date): Date {
  const rounded = new Date(d);
  if (rounded.getMinutes() >= 30) {
    rounded.setHours(rounded.getHours() + 1);
  }
  rounded.setMinutes(0, 0, 0);
  return rounded;
}

function formatDate(d: Date): string {
  return d.toLocaleString("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Normalise a header string for flexible matching */
function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const HEADER_MAP: Record<string, string> = {
  event: "event",
  loadchannelname: "loadName",
  channelkey: "channelKey",
  referenceutilitytype: "referenceUtilityType",
  utilitytype: "referenceUtilityType",
  unit: "unit",
  usage: "usage",
};

const BravegenComparison = ({ readings }: BravegenComparisonProps) => {
  const [bravegenData, setBravegenData] = useState<BravegenRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dateColumns, setDateColumns] = useState<string[]>([]);
  const [selectedDateCol, setSelectedDateCol] = useState<string>("");
  const [rawSheet, setRawSheet] = useState<any[] | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback((file: File) => {
    if (!file.name.match(/\.xlsx?$/i)) {
      toast.error("Please upload an Excel file (.xlsx or .xls)");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });

        if (json.length === 0) {
          toast.error("No data found in the spreadsheet.");
          return;
        }

        setRawSheet(json);
        setFileName(file.name);

        // Find all column headers
        const headers = Object.keys(json[0]);

        // Identify date columns: columns that look like dates (contain "/" or are Date objects)
        const dateCols = headers.filter((h) => {
          // Check if the header itself looks like a date
          const parsed = parseDate(h);
          if (parsed && parsed.getFullYear() > 2000) return true;
          // Check if the column name contains date-like patterns
          if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(h)) return true;
          if (/\d{4}-\d{2}-\d{2}/.test(h)) return true;
          return false;
        });

        // Also check for columns with "date" or "time" in the name
        const namedDateCols = headers.filter((h) => {
          const norm = normalizeHeader(h);
          return norm.includes("date") || norm.includes("time") || norm.includes("timestamp");
        });

        const allDateCols = [...new Set([...dateCols, ...namedDateCols])];
        setDateColumns(allDateCols);

        if (allDateCols.length > 0) {
          setSelectedDateCol(allDateCols[0]);
          processData(json, allDateCols[0], headers);
        } else {
          // If no date columns found, try to use the data as-is
          processData(json, "", headers);
        }

        toast.success(`Loaded ${json.length} rows from ${file.name}`);
      } catch (err) {
        console.error("Excel parse error:", err);
        toast.error("Failed to parse Excel file.");
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const processData = (json: any[], dateCol: string, headers: string[]) => {
    // Build column map
    const colMap: Record<string, string> = {};
    headers.forEach((h) => {
      const norm = normalizeHeader(h);
      if (HEADER_MAP[norm]) {
        colMap[HEADER_MAP[norm]] = h;
      }
    });

    const rows: BravegenRow[] = json.map((row) => {
      const usage = row[colMap["usage"] || "Usage"];
      const dateVal = dateCol ? row[dateCol] || dateCol : "";
      const parsedDate = parseDate(dateVal);

      return {
        event: parsedDate ? formatDate(parsedDate) : (dateCol || ""),
        loadName: String(row[colMap["loadName"] || "Load/Channel Name"] || row[colMap["loadName"] || "Load/Char"] || ""),
        channelKey: String(row[colMap["channelKey"] || "Channel Key"] || row[colMap["channelKey"] || "Channel Ke"] || ""),
        referenceUtilityType: String(row[colMap["referenceUtilityType"] || "Reference"] || row["Reference Utility Type"] || ""),
        unit: String(row[colMap["unit"] || "Unit"] || ""),
        usage: usage != null ? parseFloat(String(usage)) || null : null,
        dateTime: dateCol || "",
      };
    });

    setBravegenData(rows);
  };

  const handleDateColChange = (col: string) => {
    setSelectedDateCol(col);
    if (rawSheet) {
      processData(rawSheet, col, Object.keys(rawSheet[0]));
    }
  };

  // Compare bravegen data with extracted readings
  const comparisons = useMemo(() => {
    if (bravegenData.length === 0 || readings.length === 0) return [];

    return readings.map((reading) => {
      // Find matching bravegen row by load name (fuzzy match)
      const readingName = reading.loadName.toLowerCase().replace(/[^a-z0-9]/g, "");

      const match = bravegenData.find((bg) => {
        const bgName = bg.loadName.toLowerCase().replace(/[^a-z0-9]/g, "");
        return bgName.includes(readingName) || readingName.includes(bgName);
      });

      if (!match || match.usage == null || reading.physicalMeterRead == null) {
        return {
          loadName: reading.loadName,
          extractedReading: reading.physicalMeterRead,
          extractedDateTime: reading.dateTime,
          bravegenReading: match?.usage ?? null,
          bravegenDateTime: match?.event ?? null,
          accuracy: null,
          matched: false,
        };
      }

      // Calculate accuracy as percentage difference
      const accuracy = reading.physicalMeterRead !== 0
        ? (match.usage / reading.physicalMeterRead) * 100
        : null;

      return {
        loadName: reading.loadName,
        extractedReading: reading.physicalMeterRead,
        extractedDateTime: reading.dateTime,
        bravegenReading: match.usage,
        bravegenDateTime: match.event,
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
    setFileName(null);
    setDateColumns([]);
    setSelectedDateCol("");
    setRawSheet(null);
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
            Upload a BraveGen export Excel file to compare readings with extracted data.
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
            Drop a BraveGen Excel export here, or click to browse
          </p>
          <p className="text-xs text-muted-foreground/70">.xlsx or .xls files</p>
          <input
            id="bravegen-file-input"
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>
      ) : (
        <div className="px-5 py-3 space-y-3">
          {/* File info & date selector */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              <span className="text-sm font-mono text-foreground">{fileName}</span>
              <Badge variant="secondary" className="text-xs">{bravegenData.length} rows</Badge>
            </div>

            {dateColumns.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Date/Time Column:</span>
                <Select value={selectedDateCol} onValueChange={handleDateColChange}>
                  <SelectTrigger className="h-8 w-52 bg-card border-border font-mono text-xs">
                    <SelectValue placeholder="Select date column" />
                  </SelectTrigger>
                  <SelectContent>
                    {dateColumns.map((col) => (
                      <SelectItem key={col} value={col} className="font-mono text-xs">
                        {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Bravegen data preview */}
          {bravegenData.length > 0 && (
            <div className="rounded-md border border-border overflow-x-auto max-h-48 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                    <TableHead className="text-xs font-semibold">Event Time</TableHead>
                    <TableHead className="text-xs font-semibold">Load/Channel</TableHead>
                    <TableHead className="text-xs font-semibold">Utility Type</TableHead>
                    <TableHead className="text-xs font-semibold">Unit</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Usage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bravegenData.map((row, i) => (
                    <TableRow key={i} className="hover:bg-surface-elevated">
                      <TableCell className="font-mono text-xs">{row.event}</TableCell>
                      <TableCell className="text-xs">{row.loadName}</TableCell>
                      <TableCell className="text-xs">{row.referenceUtilityType}</TableCell>
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
                Comparison Results
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
