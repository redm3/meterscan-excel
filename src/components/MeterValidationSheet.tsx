import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, HelpCircle, Printer, LinkIcon, Calculator } from "lucide-react";
import { MeterReading } from "@/types/meter";

interface MeterValidationSheetProps {
  readings: MeterReading[];
}

const MeterValidationSheet = ({ readings }: MeterValidationSheetProps) => {
  const [loggerRow1Idx, setLoggerRow1Idx] = useState<string>("");
  const [loggerRow2Idx, setLoggerRow2Idx] = useState<string>("");
  const [refRow1Idx, setRefRow1Idx] = useState<string>("");
  const [refRow2Idx, setRefRow2Idx] = useState<string>("");
  const [serialNumber, setSerialNumber] = useState<string>("");

  const [multiplier, setMultiplier] = useState(100);
  const [formulasOpen, setFormulasOpen] = useState(false);

  // Auto-match rows by load name patterns
  useEffect(() => {
    if (readings.length < 2) return;
    if (loggerRow1Idx || loggerRow2Idx || refRow1Idx || refRow2Idx) return;

    const normalize = (s: string) => s.toLowerCase().replace(/[_\s]+/g, " ").trim();

    const retailPatterns = ["retail", "supply authority", "retailer"];
    const incomerPatterns = ["main incomer", "incomer", "msb"];

    const isRetail = (name: string) => {
      const n = normalize(name);
      return retailPatterns.some((p) => n.includes(p));
    };
    const isIncomer = (name: string) => {
      const n = normalize(name);
      return incomerPatterns.some((p) => n.includes(p));
    };

    const retailRows = readings.filter((r) => isRetail(r.loadName));
    const incomerRows = readings.filter((r) => isIncomer(r.loadName));

    // Left side: Retail Meter rows
    if (retailRows.length >= 2) {
      setLoggerRow1Idx(retailRows[0].id);
      setLoggerRow2Idx(retailRows[1].id);
    } else if (retailRows.length === 1) {
      setLoggerRow1Idx(retailRows[0].id);
    }

    // Right side: Main Incomer / kWh rows
    if (incomerRows.length >= 2) {
      setRefRow1Idx(incomerRows[0].id);
      setRefRow2Idx(incomerRows[1].id);
    } else if (incomerRows.length === 1) {
      setRefRow1Idx(incomerRows[0].id);
    }

    // Fallback: if no pattern matched, use first two rows for both
    if (retailRows.length === 0 && incomerRows.length === 0) {
      setLoggerRow1Idx(readings[0].id);
      setLoggerRow2Idx(readings[1].id);
      if (readings.length >= 4) {
        setRefRow1Idx(readings[2].id);
        setRefRow2Idx(readings[3].id);
      } else {
        setRefRow1Idx(readings[0].id);
        setRefRow2Idx(readings[1].id);
      }
    }
  }, [readings]);

  const getRow = (id: string) => readings.find((r) => r.id === id);

  const loggerRow1 = getRow(loggerRow1Idx);
  const loggerRow2 = getRow(loggerRow2Idx);
  const refRow1 = getRow(refRow1Idx);
  const refRow2 = getRow(refRow2Idx);

  const loggerReading1 = loggerRow1?.physicalMeterRead ?? 0;
  const loggerReading2 = loggerRow2?.physicalMeterRead ?? 0;
  const refReading1 = refRow1?.physicalMeterRead ?? 0;
  const refReading2 = refRow2?.physicalMeterRead ?? 0;

  const [calculated, setCalculated] = useState(false);
  const [loggerDiff, setLoggerDiff] = useState(0);
  const [refDiff, setRefDiff] = useState(0);
  const [actualKwh, setActualKwh] = useState(0);
  const [accuracy, setAccuracy] = useState(0);

  // Reset calculated state when inputs change
  useEffect(() => {
    setCalculated(false);
  }, [loggerRow1Idx, loggerRow2Idx, refRow1Idx, refRow2Idx, multiplier, readings]);

  const handleCalculate = () => {
    const diff = loggerReading2 - loggerReading1;
    const rDiff = refReading2 - refReading1;
    const actual = diff * multiplier;
    const acc = rDiff !== 0 ? (actual / rDiff) * 100 : 0;
    setLoggerDiff(diff);
    setRefDiff(rDiff);
    setActualKwh(actual);
    setAccuracy(acc);
    setCalculated(true);
  };

  const getAccuracyColor = (val: number) => {
    if (val >= 95 && val <= 105) return "bg-green-600/20 text-green-400 border-green-600/40";
    if ((val >= 90 && val < 95) || (val > 105 && val <= 110)) return "bg-yellow-600/20 text-yellow-400 border-yellow-600/40";
    return "bg-red-600/20 text-red-400 border-red-600/40";
  };

  const isPass = calculated && accuracy >= 95 && accuracy <= 105;
  const hasData = readings.length >= 2;

  const rowLabel = (r: MeterReading) =>
    `${r.loadName}${r.physicalMeterRead != null ? ` — ${r.physicalMeterRead} kWh` : ""}${r.dateTime ? ` (${r.dateTime})` : ""}`;

  const RowSelector = ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-full bg-card border-border font-mono text-sm">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {readings.map((r) => (
          <SelectItem key={r.id} value={r.id} className="font-mono text-sm">
            {rowLabel(r)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const FormulaTooltip = ({ text }: { text: string }) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground hover:text-primary cursor-help inline-block ml-1.5" />
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs text-xs">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  if (!hasData) {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-center">
        <LinkIcon className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground text-sm">
          Upload a meter read sheet and extract data to use the validation tool.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="bg-secondary px-5 py-3 border-b border-border">
        <h3 className="text-base font-bold text-foreground tracking-tight">Meter Read Validation Sheet</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Select rows from the extracted data to compare retail meter vs kWh readings.
        </p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Retail Meter Serial No.</span>
          <Input
            type="text"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder="Enter serial number"
            className="h-7 w-48 bg-background border-border font-mono text-sm"
          />
        </div>
      </div>

      {/* Row Selection Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/60">
              <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider w-36">Field</th>
              <th className="px-4 py-2.5 text-center font-semibold text-muted-foreground text-xs uppercase tracking-wider">Retail Meter / Supply Authority Meter</th>
              <th className="px-4 py-2.5 text-center font-semibold text-muted-foreground text-xs uppercase tracking-wider">kWh Readings from Meter</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr className="hover:bg-surface-elevated">
              <td className="px-4 py-2 text-muted-foreground font-medium text-xs">1st Reading Row</td>
              <td className="px-4 py-2"><RowSelector value={loggerRow1Idx} onChange={setLoggerRow1Idx} label="Select 1st retail meter row" /></td>
              <td className="px-4 py-2"><RowSelector value={refRow1Idx} onChange={setRefRow1Idx} label="Select 1st kWh reading row" /></td>
            </tr>
            <tr className="hover:bg-surface-elevated">
              <td className="px-4 py-2 text-muted-foreground font-medium text-xs">2nd Reading Row</td>
              <td className="px-4 py-2"><RowSelector value={loggerRow2Idx} onChange={setLoggerRow2Idx} label="Select 2nd retail meter row" /></td>
              <td className="px-4 py-2"><RowSelector value={refRow2Idx} onChange={setRefRow2Idx} label="Select 2nd kWh reading row" /></td>
            </tr>
            {/* Show resolved values */}
            <tr className="bg-secondary/20">
              <td className="px-4 py-2 text-muted-foreground font-medium text-xs">Date/Time (1st)</td>
              <td className="px-4 py-2 text-center font-mono text-sm text-foreground">{loggerRow1?.dateTime ?? "—"}</td>
              <td className="px-4 py-2 text-center font-mono text-sm text-foreground">{refRow1?.dateTime ?? "—"}</td>
            </tr>
            <tr className="bg-secondary/20">
              <td className="px-4 py-2 text-muted-foreground font-medium text-xs">Reading (kWh) — 1st</td>
              <td className="px-4 py-2 text-center font-mono text-sm text-foreground">{loggerReading1.toFixed(3)}</td>
              <td className="px-4 py-2 text-center font-mono text-sm text-foreground">{refReading1.toFixed(3)}</td>
            </tr>
            <tr className="bg-secondary/20">
              <td className="px-4 py-2 text-muted-foreground font-medium text-xs">Date/Time (2nd)</td>
              <td className="px-4 py-2 text-center font-mono text-sm text-foreground">{loggerRow2?.dateTime ?? "—"}</td>
              <td className="px-4 py-2 text-center font-mono text-sm text-foreground">{refRow2?.dateTime ?? "—"}</td>
            </tr>
            <tr className="bg-secondary/20">
              <td className="px-4 py-2 text-muted-foreground font-medium text-xs">Reading (kWh) — 2nd</td>
              <td className="px-4 py-2 text-center font-mono text-sm text-foreground">{loggerReading2.toFixed(3)}</td>
              <td className="px-4 py-2 text-center font-mono text-sm text-foreground">{refReading2.toFixed(3)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Calculate Button */}
      <div className="border-t border-border bg-secondary/30 px-5 py-4 space-y-3">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Calculated Results</h4>
          <Button
            onClick={handleCalculate}
            size="sm"
            className={`gap-2 ${!calculated ? 'animate-pulse' : ''}`}
          >
            <Calculator className="h-3.5 w-3.5" />
            {calculated ? "Recalculate" : "Calculate Accuracy"}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">CT Multiplier</span>
            <FormulaTooltip text="The CT ratio (e.g. 100:1). The physical meter measures scaled-down current; actual energy = meter reading × CT multiplier." />
            <Input
              type="number"
              value={multiplier}
              onChange={(e) => setMultiplier(parseFloat(e.target.value) || 0)}
              className="h-7 w-20 bg-background border-border font-mono text-sm text-right ml-auto"
            />
          </div>

          <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Logger Diff</span>
            <FormulaTooltip text="Reading₂ − Reading₁: The raw kWh difference recorded by the logger between the two timestamps." />
            <span className="font-mono text-sm text-foreground ml-auto">{calculated ? `${loggerDiff.toFixed(3)} kWh` : "—"}</span>
          </div>

          <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Reference Diff</span>
            <FormulaTooltip text="RefReading₂ − RefReading₁: The kWh difference from the independent clamp meter — your ground truth." />
            <span className="font-mono text-sm text-foreground ml-auto">{calculated ? `${refDiff.toFixed(1)} kWh` : "—"}</span>
          </div>

          <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Actual kWh</span>
            <FormulaTooltip text="Logger Diff × CT Multiplier: Scales the logger's secondary-side reading to real-world primary-side energy." />
            <span className="font-mono text-sm text-foreground ml-auto">{calculated ? `${actualKwh.toFixed(1)} kWh` : "—"}</span>
          </div>
        </div>

        {/* Accuracy */}
        {calculated ? (
          <div className={`flex items-center justify-between rounded-md border px-4 py-3 ${getAccuracyColor(accuracy)}`}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Accuracy</span>
              <FormulaTooltip text="(Actual kWh ÷ Reference kWh) × 100. Anything within ±5% (95–105%) is typically accepted as a commissioning pass." />
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-lg font-bold">{accuracy.toFixed(1)}%</span>
              <Badge variant={isPass ? "default" : "destructive"} className={isPass ? "bg-green-600 hover:bg-green-700" : ""}>
                {isPass ? "PASS" : "FAIL"}
              </Badge>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            Press "Calculate Accuracy" to run validation
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            Print / Export
          </Button>
        </div>
      </div>

      {/* Formula Summary */}
      <Collapsible open={formulasOpen} onOpenChange={setFormulasOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between border-t border-border bg-secondary/50 px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-secondary transition-colors">
          Formula Reference
          <ChevronDown className={`h-4 w-4 transition-transform ${formulasOpen ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-secondary/40 border-b border-border">
                  <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Step</th>
                  <th className="px-4 py-2 text-left font-semibold text-muted-foreground font-mono">Formula</th>
                  <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Plain English</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-4 py-2 text-foreground font-medium">Logger Diff</td>
                  <td className="px-4 py-2 font-mono text-muted-foreground">Reading₂ − Reading₁</td>
                  <td className="px-4 py-2 text-muted-foreground">How many kWh the logger counted</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-foreground font-medium">Ref Diff</td>
                  <td className="px-4 py-2 font-mono text-muted-foreground">RefReading₂ − RefReading₁</td>
                  <td className="px-4 py-2 text-muted-foreground">How many kWh the clamp meter counted</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-foreground font-medium">Actual kWh</td>
                  <td className="px-4 py-2 font-mono text-muted-foreground">Logger Diff × CT Multiplier</td>
                  <td className="px-4 py-2 text-muted-foreground">Scale logger reading to real-world energy</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-foreground font-medium">Accuracy %</td>
                  <td className="px-4 py-2 font-mono text-muted-foreground">(Actual kWh ÷ Ref kWh) × 100</td>
                  <td className="px-4 py-2 text-muted-foreground">How closely the logger matches the reference</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default MeterValidationSheet;
