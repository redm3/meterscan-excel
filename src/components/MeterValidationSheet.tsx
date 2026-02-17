import { useState, useMemo } from "react";
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
import { ChevronDown, HelpCircle, Printer } from "lucide-react";

const MeterValidationSheet = () => {
  const [loggerDate1, setLoggerDate1] = useState("2/02/2026 4:30pm");
  const [loggerDate2, setLoggerDate2] = useState("4/02/2026 8:56am");
  const [refDate1, setRefDate1] = useState("2/2/2026 16:30");
  const [refDate2, setRefDate2] = useState("4/2/2026 9:00");

  const [loggerReading1, setLoggerReading1] = useState(3293.777);
  const [loggerReading2, setLoggerReading2] = useState(3301.689);
  const [refReading1, setRefReading1] = useState(8);
  const [refReading2, setRefReading2] = useState(777);

  const [multiplier, setMultiplier] = useState(100);
  const [formulasOpen, setFormulasOpen] = useState(false);

  const loggerDiff = useMemo(() => loggerReading2 - loggerReading1, [loggerReading1, loggerReading2]);
  const refDiff = useMemo(() => refReading2 - refReading1, [refReading1, refReading2]);
  const actualKwh = useMemo(() => loggerDiff * multiplier, [loggerDiff, multiplier]);
  const accuracy = useMemo(() => (refDiff !== 0 ? (actualKwh / refDiff) * 100 : 0), [actualKwh, refDiff]);

  const getAccuracyColor = (val: number) => {
    if (val >= 95 && val <= 105) return "bg-green-600/20 text-green-400 border-green-600/40";
    if ((val >= 90 && val < 95) || (val > 105 && val <= 110)) return "bg-yellow-600/20 text-yellow-400 border-yellow-600/40";
    return "bg-red-600/20 text-red-400 border-red-600/40";
  };

  const isPass = accuracy >= 95 && accuracy <= 105;

  const numInput = (value: number, onChange: (v: number) => void) => (
    <Input
      type="number"
      step="any"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="h-8 w-32 bg-card border-border font-mono text-sm text-right"
    />
  );

  const textInput = (value: string, onChange: (v: string) => void) => (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-44 bg-card border-border font-mono text-sm"
    />
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

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="bg-secondary px-5 py-3 border-b border-border">
        <h3 className="text-base font-bold text-foreground tracking-tight">Meter Read Validation Sheet</h3>
        <div className="flex gap-6 mt-1.5 text-xs text-muted-foreground font-mono">
          <span>Main Incomer</span>
          <span>ICP: <span className="text-foreground">1002080192</span></span>
          <span>LCC: <span className="text-foreground">8C</span></span>
        </div>
      </div>

      {/* Readings Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/60">
              <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider w-36">Field</th>
              <th className="px-4 py-2.5 text-center font-semibold text-muted-foreground text-xs uppercase tracking-wider">Main Incomer (Logger)</th>
              <th className="px-4 py-2.5 text-center font-semibold text-muted-foreground text-xs uppercase tracking-wider">Reference Meter (Clamp)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr className="hover:bg-surface-elevated">
              <td className="px-4 py-2 text-muted-foreground font-medium text-xs">Date / Time (1st)</td>
              <td className="px-4 py-2 text-center">{textInput(loggerDate1, setLoggerDate1)}</td>
              <td className="px-4 py-2 text-center">{textInput(refDate1, setRefDate1)}</td>
            </tr>
            <tr className="hover:bg-surface-elevated">
              <td className="px-4 py-2 text-muted-foreground font-medium text-xs">Reading (kWh)</td>
              <td className="px-4 py-2 text-center">{numInput(loggerReading1, setLoggerReading1)}</td>
              <td className="px-4 py-2 text-center">{numInput(refReading1, setRefReading1)}</td>
            </tr>
            <tr className="hover:bg-surface-elevated">
              <td className="px-4 py-2 text-muted-foreground font-medium text-xs">Date / Time (2nd)</td>
              <td className="px-4 py-2 text-center">{textInput(loggerDate2, setLoggerDate2)}</td>
              <td className="px-4 py-2 text-center">{textInput(refDate2, setRefDate2)}</td>
            </tr>
            <tr className="hover:bg-surface-elevated">
              <td className="px-4 py-2 text-muted-foreground font-medium text-xs">Reading (kWh)</td>
              <td className="px-4 py-2 text-center">{numInput(loggerReading2, setLoggerReading2)}</td>
              <td className="px-4 py-2 text-center">{numInput(refReading2, setRefReading2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Calculated Fields */}
      <div className="border-t border-border bg-secondary/30 px-5 py-4 space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Calculated Results</h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* CT Multiplier */}
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

          {/* Logger Diff */}
          <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Logger Diff</span>
            <FormulaTooltip text="Reading₂ − Reading₁: The raw kWh difference recorded by the logger between the two timestamps." />
            <span className="font-mono text-sm text-foreground ml-auto">{loggerDiff.toFixed(3)} kWh</span>
          </div>

          {/* Reference Diff */}
          <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Reference Diff</span>
            <FormulaTooltip text="RefReading₂ − RefReading₁: The kWh difference from the independent clamp meter — your ground truth." />
            <span className="font-mono text-sm text-foreground ml-auto">{refDiff.toFixed(1)} kWh</span>
          </div>

          {/* Actual kWh */}
          <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Actual kWh</span>
            <FormulaTooltip text="Logger Diff × CT Multiplier: Scales the logger's secondary-side reading to real-world primary-side energy." />
            <span className="font-mono text-sm text-foreground ml-auto">{actualKwh.toFixed(1)} kWh</span>
          </div>
        </div>

        {/* Accuracy */}
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

        {/* Print button */}
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
